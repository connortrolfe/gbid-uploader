import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

      // Debug environment variables
    console.log('Environment variables check:', {
      hasPineconeKey: !!process.env.PINECONE_API_KEY,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasPineconeIndex: !!process.env.PINECONE_INDEX,
      hasPineconeEnv: !!process.env.PINECONE_ENV,
      pineconeEnv: process.env.PINECONE_ENV,
      pineconeIndex: process.env.PINECONE_INDEX,
      nodeEnv: process.env.NODE_ENV
    });

  try {
    const { type, data } = req.body;

    if (type !== 'single') {
      return res.status(400).json({ error: 'Invalid upload type' });
    }

    const { name, gbid, properties, alternateNames, specialNotes } = data;

    // Validate required fields
    if (!name || !gbid) {
      return res.status(400).json({ error: 'Name and GBID are required' });
    }

    // Check environment variables
    if (!process.env.PINECONE_API_KEY) {
      return res.status(500).json({ error: 'Pinecone API key not configured' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }
    if (!process.env.PINECONE_INDEX) {
      return res.status(500).json({ error: 'Pinecone index name not configured' });
    }
    if (!process.env.PINECONE_ENV) {
      return res.status(500).json({ error: 'Pinecone environment not configured' });
    }

    // Initialize Pinecone client inside handler
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
      environment: process.env.PINECONE_ENV,
    });

    // Initialize OpenAI client inside handler
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Get Pinecone index
    const index = pinecone.index(process.env.PINECONE_INDEX);

    // Create text for embedding
    let itemText = `Name: ${name}\nGBID: ${gbid}\n`;
    if (properties) {
      itemText += `Properties: ${properties}\n`;
    }
    if (alternateNames) {
      itemText += `Alternate names: ${alternateNames}\n`;
    }
    if (specialNotes) {
      itemText += `Special notes: ${specialNotes}\n`;
    }

    // Generate embedding using OpenAI
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: itemText,
    });

    const vector = embeddingResponse.data[0].embedding;

    // Prepare metadata
    const metadata = {
      name: name,
      gbid: gbid,
      properties: properties || '',
      alternate_names: alternateNames || '',
      special_notes: specialNotes || '',
    };

    // Upload to Pinecone with retry logic and timeout
    let retries = 3;
    let lastError;
    
    while (retries > 0) {
      try {
        // Add timeout to the operation
        const uploadPromise = index.upsert([{
          id: gbid,
          values: vector,
          metadata: metadata,
        }]);
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Upload timeout')), 30000)
        );
        
        await Promise.race([uploadPromise, timeoutPromise]);
        break; // Success, exit retry loop
      } catch (error) {
        lastError = error;
        retries--;
        
        console.log(`Pinecone upload failed (attempt ${4-retries}/3):`, error.message);
        
        if (retries > 0) {
          console.log(`Retrying in 2 seconds... (${retries} attempts left)`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    if (retries === 0) {
      throw lastError;
    }

    return res.status(200).json({
      success: true,
      message: `Successfully uploaded ${name} (${gbid})`,
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Log environment variable status (without exposing values)
    console.log('Environment check:', {
      hasPineconeKey: !!process.env.PINECONE_API_KEY,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasPineconeIndex: !!process.env.PINECONE_INDEX,
      pineconeIndex: process.env.PINECONE_INDEX
    });
    
    return res.status(500).json({
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
} 
