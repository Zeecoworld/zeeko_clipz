const { json, passwordMatches, makeSession } = require('./lib/shared');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!process.env.APP_PASSWORD) {
    return json(500, { error: 'APP_PASSWORD is not set in Netlify environment variables' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return json(400, { error: 'Request body must be valid JSON' });
  }

  if (!passwordMatches(body.password)) {
    await sleep(700);
    return json(401, { error: 'Incorrect password' });
  }
  return json(200, makeSession(body.remember === true));
};
