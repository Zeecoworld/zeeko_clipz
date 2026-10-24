const { json, authorized, publicUrlProblem } = require('./lib/shared');
const { probeDuration } = require('./lib/mp4');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!authorized(event)) return json(401, { error: 'Invalid app password' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return json(400, { error: 'Request body must be valid JSON' });
  }

  const urls = (Array.isArray(body.urls) ? body.urls : []).map((url) => String(url || '').trim()).slice(0, 4);
  if (!urls.length) return json(400, { error: 'No video links were sent' });

  const results = await Promise.all(
    urls.map(async (url) => {
      const problem = publicUrlProblem(url);
      if (problem) return { url, seconds: null, error: problem };
      try {
        const seconds = Math.floor(await probeDuration(url));
        return { url, seconds, error: null };
      } catch (err) {
        return { url, seconds: null, error: err.message };
      }
    })
  );

  return json(200, { results });
};
