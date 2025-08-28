  const axios = require('axios');

  // Optional OpenAI enhancer
  let openai = null;
  try {
    const OpenAI = require('openai');
    if (process.env.OPENAI_API_KEY) {
      openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  } catch (_) {}

  async function generateIdea() {
    // 1) Seed from Dexscreener
    let base = 'SOL';
    let seeds = [];
    try {
      const res = await axios.get('https://api.dexscreener.com/latest/dex/search?q=chain:solana', { timeout: 10000 });
      const pairs = Array.isArray(res.data?.pairs) ? res.data.pairs.slice(0, 8) : [];
      seeds = pairs.map(p => p?.baseToken?.symbol || p?.baseToken?.name || '').filter(Boolean);
      base = (seeds[0] || 'SOL').replace(/[^a-z0-9]/gi, '');
    } catch(_) {}

    // 2) Default idea
    let idea = {
      name: `${base.slice(0,8)} Blast`,
      symbol: (base.slice(0,4) + 'B').toUpperCase(),
      description: seeds.length
        ? `Meme token infused with trends from ${seeds.slice(0,3).join(', ')} on Solana.`
        : 'Auto-generated Solana meme token idea.'
    };

    // 3) If OpenAI is available, enhance the text
    if (openai) {
      try {
        const prompt = `You are naming a new Solana meme token. Based on trending seeds: ${seeds.join(', ')}. 
Return a compact JSON with keys: name (<= 24 chars), symbol (<= 8 uppercase letters), description (<= 160 chars).`;
        const resp = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You produce safe, short JSON only.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.9,
          max_tokens: 200
        });
        const text = resp.choices?.[0]?.message?.content?.trim() || '';
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const j = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
          idea = {
            name: j.name || idea.name,
            symbol: j.symbol || idea.symbol,
            description: j.description || idea.description
          };
        }
      } catch (_) {
        // keep default idea
      }
    }

    return idea;
  }

  module.exports = { generateIdea };
