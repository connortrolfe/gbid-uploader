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

  const pineconeApiKey = process.env.PINECONE_API_KEY;
  const pineconeHost = process.env.PINECONE_HOST;
  if (!pineconeApiKey || !pineconeHost) {
    return res.status(500).json({ error: 'PINECONE_API_KEY or PINECONE_HOST not set' });
  }

  try {
    const { query } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Initialize OpenAI
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Generate embedding for the search query
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: query,
    });
    const queryVector = embeddingResponse.data[0].embedding;

    // Query Pinecone via HTTP
    const queryUrl = `${pineconeHost}/query`;
    const queryBody = {
      vector: queryVector,
      topK: 50,
      includeMetadata: true,
      includeValues: false
    };
    const queryResponse = await fetch(queryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': pineconeApiKey,
      },
      body: JSON.stringify(queryBody),
    });

    if (!queryResponse.ok) {
      const errorText = await queryResponse.text();
      return res.status(500).json({
        error: `Pinecone query failed: ${queryResponse.status} - ${queryResponse.statusText}`,
        details: errorText,
      });
    }

    const data = await queryResponse.json();
    const results = (data.matches || []).map(match => ({
      gbid: match.metadata?.gbid || '',
      gbidTemplate: match.metadata?.gbidTemplate || '',
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
