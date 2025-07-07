import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

// Initialize Pinecone
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

    // Upload to Pinecone
    await index.upsert([{
      id: gbid,
      values: vector,
      metadata: metadata,
    }]);

    return res.status(200).json({
      success: true,
      message: `Successfully uploaded ${name} (${gbid})`,
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
} 