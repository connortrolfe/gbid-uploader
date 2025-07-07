import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

// Initialize Pinecone
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
  environment: process.env.PINECONE_ENV || 'us-east-1-aws',
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
    const { query } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Search query is required' });
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

    // Generate embedding for the search query
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: query,
    });

    const queryVector = embeddingResponse.data[0].embedding;

    // Search Pinecone
    const searchResponse = await index.query({
      vector: queryVector,
      topK: 50, // Return top 50 results
      includeMetadata: true,
    });

    // Format results
    const results = searchResponse.matches.map(match => ({
      gbid: match.id,
      name: match.metadata?.name || '',
      properties: match.metadata?.properties || '',
      alternate_names: match.metadata?.alternate_names || '',
      special_notes: match.metadata?.special_notes || '',
      score: match.score
    }));

    return res.status(200).json({
      success: true,
      results: results,
      total: results.length
    });

  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
} 
