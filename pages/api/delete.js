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
    const { gbid, gbidTemplate, name } = req.body;
    let id = gbid;
    if (!id && gbidTemplate) id = gbidTemplate;
    if (!id && name) id = name.replace(/\s+/g, '_').toLowerCase();
    if (!id) {
      return res.status(400).json({ error: 'At least one of GBID, GBID Template, or Name is required' });
    }
    // Delete from Pinecone via HTTP
    const deleteUrl = `${pineconeHost}/vectors/delete`;
    const deleteBody = { ids: [id] };
    const deleteResponse = await fetch(deleteUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': pineconeApiKey,
      },
      body: JSON.stringify(deleteBody),
    });
    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      return res.status(500).json({
        error: `Pinecone delete failed: ${deleteResponse.status} - ${deleteResponse.statusText}`,
        details: errorText,
      });
    }
    return res.status(200).json({
      success: true,
      message: `Successfully deleted item with ID: ${id}`,
    });
  } catch (error) {
    console.error('Delete error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
} 
