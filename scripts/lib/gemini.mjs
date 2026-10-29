// Asks Gemini (free tier) to write the video scripts. There is no 10-second limit here, so it can wait and retry.
const SYSTEM = `You write scripts for short vertical videos (about 20 to 40 seconds) for a channel about coding, technology and AI. The viewers are beginners and intermediate developers. The videos are text and animation only, with no voice, so every line must be short and easy to read on a phone.

Rules:
- Teach one clear, useful idea per video. Use well-established facts and good practice that you are certain about.
- Never invent statistics, quotes, release dates, prices, benchmarks or news. Never say that something "just happened". If you are not sure that something is true, leave it out.
- Trending topics are only for inspiration. Pick a practical concept, tip or comparison related to the topic that a curious viewer would want to understand. Do not copy any trending title and do not report news.
- Friendly, confident, plain English. No emoji. No hashtags inside the video text.
- Every video in the batch must be clearly different from the others and from the recent topics you are given.
- Code must be correct, short and understandable without any setup.
Answer with a JSON array only, with no other text.`;

const TEMPLATE_HELP = `Each array item is one video with these keys.
Always: "template" ("tips", "myth", "code" or "versus"), "label" (2-3 word tag shown on screen such as "Python tip" or "AI basics", at most 22 characters), "hook" (the opening line, a curiosity-making sentence, at most 70 characters), "title" (search-friendly video title, at most 90 characters), "description" (two short sentences, at most 300 characters), "hashtags" (3 to 5 words without the # sign).

template "tips": "items" is a list of 3 to 5 objects with "heading" (at most 48 characters) and "detail" (one sentence, at most 110 characters).
template "myth": "pairs" is a list of 2 or 3 objects with "myth" (a common wrong belief, at most 80 characters) and "fact" (the correction, at most 130 characters).
template "code": "language" (one of javascript, typescript, python, bash, sql), "code" (4 to 11 lines, every line at most 36 characters, spaces for indentation, no tabs), "steps" (2 or 3 objects with "line" = the 1-based line number the step explains, and "text" at most 90 characters).
template "versus": "question" (at most 60 characters), "a" and "b" (each with "label" at most 26 characters and "points", 2 or 3 strings of at most 40 characters). The two sides must be balanced and fair, with no insults.`;

export const buildPrompt = ({count, trends, history, brand}) => {
  const parts = [`Write ${count} different video scripts for the channel "${brand}".`, TEMPLATE_HELP];
  if (count >= 4) parts.push('Use at least 3 different templates across the batch.');
  if (trends.titles.length) {
    parts.push(`Popular on YouTube right now (inspiration only):\n${trends.titles.map((t) => `- ${t}`).join('\n')}${trends.tags.length ? `\nFrequent tags: ${trends.tags.join(', ')}` : ''}`);
  } else {
    parts.push('No trend data is available today, so pick timeless, popular coding, tech and AI topics.');
  }
  if (history.length) parts.push(`Recent videos, do not repeat these topics:\n${history.map((h) => `- ${h}`).join('\n')}`);
  return parts.join('\n\n');
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const askGemini = async ({apiKey, prompt, model = 'gemini-2.5-flash', log = console.log}) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body = JSON.stringify({
    systemInstruction: {parts: [{text: SYSTEM}]},
    contents: [{role: 'user', parts: [{text: prompt}]}],
    generationConfig: {temperature: 0.9, maxOutputTokens: 16000, responseMimeType: 'application/json'}
  });
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const res = await fetch(url, {method: 'POST', headers: {'x-goog-api-key': apiKey, 'content-type': 'application/json'}, body, signal: AbortSignal.timeout(180000)});
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const text = (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('');
      if (!text) throw new Error('Gemini returned no text');
      return text;
    }
    const detail = data.error?.message || `HTTP ${res.status}`;
    if (res.status === 429 && /per ?day|daily/i.test(detail)) throw new Error('the free Gemini daily quota is used up for today');
    if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) throw new Error(`Gemini rejected the request: ${detail}`);
    if (attempt === 5) throw new Error(`Gemini kept failing: ${detail}`);
    const wait = 20000 * attempt;
    log(`gemini: ${detail}. Waiting ${wait / 1000}s before attempt ${attempt + 1}`);
    await sleep(wait);
  }
  throw new Error('Gemini did not answer');
};

export const parseVideos = (text) => {
  const json = text.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const start = json.indexOf('[');
  const end = json.lastIndexOf(']');
  let list;
  try {
    list = JSON.parse(json.slice(start, end + 1));
  } catch (err) {
    throw new Error('the AI answer could not be read as JSON');
  }
  if (!Array.isArray(list) || !list.length) throw new Error('the AI returned no videos');
  return list;
};
