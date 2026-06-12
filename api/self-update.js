export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { provider, apiKey, currentPrompts, searchKey } = req.body;

  let searchContext = '';

  // Web search for latest AI practices
  if (searchKey) {
    try {
      const searchRes = await fetch(
        `https://api.serper.dev/search`,
        {
          method: 'POST',
          headers: {
            'X-API-KEY': searchKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ q: 'latest AI coding best practices 2026', num: 3 })
        }
      );
      const searchData = await searchRes.json();
      searchContext = searchData.organic?.slice(0, 3).map(r => r.snippet).join(' ') || '';
    } catch (e) {
      searchContext = '';
    }
  }

  // Self-Audit
  const auditPrompt = `You are ARNOP Self-Auditor. Review these agent system prompts and find weaknesses or improvement areas. ${searchContext ? 'Latest context: ' + searchContext : ''} Return ONLY a JSON array: [{"issue":"...","suggestion":"..."}]`;

  const auditResult = await callAPI(provider, apiKey, auditPrompt, JSON.stringify(currentPrompts));
  
  let issues = [];
  try {
    const clean = auditResult.replace(/```json|```/g, '').trim();
    issues = JSON.parse(clean);
  } catch (e) {
    return res.status(200).json({ updated: false, reason: 'Audit parse failed' });
  }

  // Self-Upgrade
  const upgradePrompt = `You are ARNOP Self-Upgrader. Given these issues, rewrite improved agent system prompts. Return ONLY JSON: {"writer_prompt":"...","reviewer_prompt":"..."}`;

  const upgradeResult = await callAPI(provider, apiKey, upgradePrompt, JSON.stringify(issues));

  let newPrompts = {};
  try {
    const clean = upgradeResult.replace(/```json|```/g, '').trim();
    newPrompts = JSON.parse(clean);
  } catch (e) {
    return res.status(200).json({ updated: false, reason: 'Upgrade parse failed' });
  }

  return res.status(200).json({
    updated: true,
    newPrompts,
    issues,
    timestamp: new Date().toISOString()
  });
}

async function callAPI(provider, apiKey, systemPrompt, userMessage) {
  if (provider === 'gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + '\n\n' + userMessage }] }]
        })
      }
    );
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
  } else {
    const endpoints = {
      groq: 'https://api.groq.com/openai/v1/chat/completions',
      mistral: 'https://api.mistral.ai/v1/chat/completions',
      deepseek: 'https://api.deepseek.com/v1/chat/completions',
      openai: 'https://api.openai.com/v1/chat/completions'
    };
    const models = {
      groq: 'llama3-8b-8192',
      mistral: 'mistral-small-latest',
      deepseek: 'deepseek-chat',
      openai: 'gpt-4o-mini'
    };
    const res = await fetch(endpoints[provider], {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: models[provider],
        max_tokens: 1000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ]
      })
    });
    const data = await res.json();
    return data.choices[0].message.content;
  }
}
