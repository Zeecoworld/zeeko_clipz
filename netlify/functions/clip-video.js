const { json, authorized } = require('./lib/shared');
const { configureCloudinary, validateSource, buildClips } = require('./lib/clips');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }
  if (!authorized(event)) {
    return json(401, { error: 'Invalid app password' });
  }

  const configError = configureCloudinary();
  if (configError) return json(500, { error: configError });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return json(400, { error: 'Request body must be valid JSON' });
  }

  const videoUrl = String(payload.videoUrl || '').trim();
  const totalDuration = Math.floor(Number(payload.totalDuration));
  const headline = String(payload.headline || '').trim().slice(0, 120);

  const problem = validateSource(videoUrl, totalDuration);
  if (problem) return json(400, { error: problem });

  return json(200, { clips: buildClips(videoUrl, totalDuration, headline) });
};
