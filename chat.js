export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { messages, provider } = req.body;

  const keys = {
    groq: process.env.GROQ_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    mistral: process.env.MISTRAL_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY
  };

  const apiKey = keys[provider || 'groq'];
  if (!apiKey) return res.status(400).json({ error: 'Provider not configured' });

  try {
    let result = '';
    if (provider === 'gemini') {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: messages.map(m => ({ parts: [{ text: m.content }] })) })
        }
      );
      const d = await r.json();
      result = d.candidates[0].content.parts[0].text;
    } else {
      const endpoints = {
        groq: 'https://api.groq.com/openai/v1/chat/completions',
        mistral: 'https://api.mistral.ai/v1/chat/completions',
        deepseek: 'https://api.deepseek.com/v1/chat/completions'
      };
      const models = {
        groq: 'llama3-8b-8192',
        mistral: 'mistral-small-latest',
        deepseek: 'deepseek-chat'
      };
      const r = await fetch(endpoints[provider || 'groq'], {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: models[provider || 'groq'],
          max_tokens: 1000,
          messages
        })
      });
      const d = await r.json();
      result = d.choices[0].message.content;
    }
    res.status(200).json({ result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
