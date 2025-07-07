import { Pinecone } from '@pinecone-database/pinecone';

// Initialize Pinecone
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
  environment: process.env.PINECONE_ENV || 'us-east-1-aws',
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
    const { gbid } = req.body;

    if (!gbid) {
      return res.status(400).json({ error: 'GBID is required' });
    }

    // Check environment variables
    if (!process.env.PINECONE_API_KEY) {
      return res.status(500).json({ error: 'Pinecone API key not configured' });
    }
    if (!process.env.PINECONE_INDEX) {
      return res.status(500).json({ error: 'Pinecone index name not configured' });
    }

    // Get Pinecone index
    const index = pinecone.index(process.env.PINECONE_INDEX);

    // Delete from Pinecone
    await index.deleteOne(gbid);

    return res.status(200).json({
      success: true,
      message: `Successfully deleted item with GBID: ${gbid}`,
    });

  } catch (error) {
    console.error('Delete error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
} 
