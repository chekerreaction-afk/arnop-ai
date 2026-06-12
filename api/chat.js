export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { messages, provider, getProviders } = req.body;

  const keys = {
    groq: process.env.GROQ_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    mistral: process.env.MISTRAL_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY
  };

  if (getProviders) {
    const available = Object.keys(keys).filter(k => keys[k]);
    return res.status(200).json({ providers: available });
  }

  const p = provider || Object.keys(keys).find(k => keys[k]);
  const apiKey = keys[p];
  if (!apiKey) return res.status(400).json({ error: `No API key for provider: ${p}` });

  // Fix message alternation
  const systemMsg = messages.find(m => m.role === 'system');
  const otherMsgs = messages.filter(m => m.role !== 'system');
  const fixedMsgs = [];
  let lastRole = null;
  for (const m of otherMsgs) {
    if (m.role === lastRole) continue;
    fixedMsgs.push(m);
    lastRole = m.role;
  }
  const safeMessages = systemMsg ? [systemMsg, ...fixedMsgs] : fixedMsgs;

  try {
    let result = '';

    if (p === 'gemini') {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: safeMessages
              .filter(m => m.role !== 'system')
              .map(m => ({ parts: [{ text: m.content }] }))
          })
        }
      );
      const d = await r.json();
      if (!d.candidates || !d.candidates[0]) {
        return res.status(500).json({ error: 'Gemini error: ' + JSON.stringify(d) });
      }
      result = d.candidates[0].content.parts[0].text;
    } else {
      const endpoints = {
        groq: 'https://api.groq.com/openai/v1/chat/completions',
        mistral: 'https://api.mistral.ai/v1/chat/completions',
        deepseek: 'https://api.deepseek.com/v1/chat/completions'
      };
      const models = {
        groq: 'llama-3.3-70b-versatile',
        mistral: 'mistral-small-latest',
        deepseek: 'deepseek-chat'
      };
      const r = await fetch(endpoints[p], {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: models[p],
          max_tokens: 1000,
          messages: safeMessages
        })
      });
      const d = await r.json();
      if (!d.choices || !d.choices[0]) {
        return res.status(500).json({ error: 'API error: ' + JSON.stringify(d) });
      }
      result = d.choices[0].message.content;
    }

    res.status(200).json({ result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
