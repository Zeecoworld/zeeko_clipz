const { json, authorized, supabase, siteUrl, tiktokMode, makeState } = require('./lib/shared');

const PLATFORMS = ['youtube', 'tiktok'];

const redirectUri = (platform) => `${siteUrl()}/auth/${platform}/callback`;

const configured = (platform) =>
  platform === 'youtube'
    ? Boolean(process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET)
    : Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);

const authorizeUrl = (platform) => {
  const state = makeState(platform);
  if (platform === 'youtube') {
    const params = new URLSearchParams({
      client_id: process.env.YT_CLIENT_ID,
      redirect_uri: redirectUri('youtube'),
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube.upload',
      access_type: 'offline',
      prompt: 'consent',
      state
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    scope: tiktokMode() === 'direct' ? 'user.info.basic,video.publish' : 'user.info.basic,video.upload',
    response_type: 'code',
    redirect_uri: redirectUri('tiktok'),
    state
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
};

exports.handler = async (event) => {
  if (!authorized(event)) return json(401, { error: 'Invalid app password' });

  let db;
  try {
    db = supabase();
  } catch (err) {
    return json(500, { error: err.message });
  }

  if (event.httpMethod === 'GET') {
    const { data, error } = await db
      .from('platform_tokens')
      .select('platform, account_label, needs_reauth, connected_at, scopes');
    if (error) return json(500, { error: error.message });

    const status = {};
    PLATFORMS.forEach((platform) => {
      const row = (data || []).find((item) => item.platform === platform);
      const wanted = tiktokMode() === 'direct' ? 'video.publish' : 'video.upload';
      const scopeMismatch =
        platform === 'tiktok' && Boolean(row && row.scopes) && !row.scopes.split(/[ ,]+/).includes(wanted);
      status[platform] = {
        configured: configured(platform),
        connected: Boolean(row),
        needsReauth: Boolean(row && (row.needs_reauth || scopeMismatch)),
        mode: platform === 'tiktok' ? tiktokMode() : null,
        privacy:
          platform === 'youtube'
            ? process.env.YT_PRIVACY_STATUS || 'public'
            : tiktokMode() === 'draft'
              ? 'You choose in the TikTok app'
              : process.env.TIKTOK_PRIVACY_LEVEL || 'SELF_ONLY',
        label: row ? row.account_label : null,
        connectedAt: row ? row.connected_at : null,
        redirectUri: redirectUri(platform)
      };
    });
    return json(200, status);
  }

  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (err) {
      return json(400, { error: 'Request body must be valid JSON' });
    }
    const platform = String(body.platform || '');
    if (!PLATFORMS.includes(platform)) return json(400, { error: 'Unknown platform' });
    if (!configured(platform)) {
      return json(400, {
        error:
          platform === 'youtube'
            ? 'Add YT_CLIENT_ID and YT_CLIENT_SECRET in Netlify first'
            : 'Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in Netlify first'
      });
    }
    if (!siteUrl()) return json(500, { error: 'SITE_URL is not set in Netlify' });
    return json(200, { url: authorizeUrl(platform) });
  }

  if (event.httpMethod === 'DELETE') {
    const platform = event.queryStringParameters && event.queryStringParameters.platform;
    if (!PLATFORMS.includes(platform)) return json(400, { error: 'Unknown platform' });
    const { error } = await db.from('platform_tokens').delete().eq('platform', platform);
    if (error) return json(500, { error: error.message });
    return json(200, { disconnected: true });
  }

  return json(405, { error: 'Method not allowed' });
};
