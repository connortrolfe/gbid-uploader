import OpenAI from 'openai';

export default async function handler(req, res) {
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
    const { originalGbid, data } = req.body;
    if (!originalGbid || !data) {
      return res.status(400).json({ error: 'Original GBID and data are required' });
    }
    const { name, gbid, properties, alternateNames, specialNotes } = data;
    if (!name || !gbid) {
      return res.status(400).json({ error: 'Name and GBID are required' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Initialize OpenAI
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Create text for embedding
    let itemText = `Name: ${name}\nGBID: ${gbid}\n`;
    if (properties) itemText += `Properties: ${properties}\n`;
    if (alternateNames) itemText += `Alternate names: ${alternateNames}\n`;
    if (specialNotes) itemText += `Special notes: ${specialNotes}\n`;

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

    // Upsert to Pinecone via HTTP
    const upsertUrl = `${pineconeHost}/vectors/upsert`;
    const upsertBody = {
      vectors: [
        {
          id: gbid,
          values: vector,
          metadata: metadata,
        },
      ],
    };
    const upsertResponse = await fetch(upsertUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': pineconeApiKey,
      },
      body: JSON.stringify(upsertBody),
    });

    if (!upsertResponse.ok) {
      const errorText = await upsertResponse.text();
      return res.status(500).json({
        error: `Pinecone upsert failed: ${upsertResponse.status} - ${upsertResponse.statusText}`,
        details: errorText,
      });
    }

    // If GBID changed, delete the old record
    if (originalGbid !== gbid) {
      const deleteUrl = `${pineconeHost}/vectors/delete`;
      const deleteBody = { ids: [originalGbid] };
      await fetch(deleteUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': pineconeApiKey,
        },
        body: JSON.stringify(deleteBody),
      });
    }

    return res.status(200).json({
      success: true,
      message: `Successfully updated ${name} (${gbid})`,
    });
  } catch (error) {
    console.error('Update error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
} 
