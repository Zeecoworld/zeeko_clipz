const { supabase, siteUrl, readState } = require('./lib/shared');

async function exchangeYouTube(code, base) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.YT_CLIENT_ID || '',
      client_secret: process.env.YT_CLIENT_SECRET || '',
      redirect_uri: `${base}/auth/youtube/callback`,
      grant_type: 'authorization_code'
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Google login failed (${res.status})`);
  }
  if (!data.refresh_token) {
    throw new Error(
      'Google did not return a refresh token. Remove this app under your Google account permissions, then connect again.'
    );
  }
  return {
    refresh_token: data.refresh_token,
    access_token: data.access_token,
    expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
    account_label: null,
    scopes: data.scope || null
  };
}

async function exchangeTikTok(code, base) {
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY || '',
      client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${base}/auth/tiktok/callback`
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token || !data.refresh_token) {
    throw new Error(data.error_description || data.error || `TikTok login failed (${res.status})`);
  }

  let label = null;
  try {
    const info = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', {
      headers: { Authorization: `Bearer ${data.access_token}` }
    });
    const infoData = await info.json();
    label = (infoData.data && infoData.data.user && infoData.data.user.display_name) || null;
  } catch (err) {
    label = null;
  }

  return {
    refresh_token: data.refresh_token,
    access_token: data.access_token,
    expires_at: new Date(Date.now() + (data.expires_in || 86400) * 1000).toISOString(),
    account_label: label,
    scopes: data.scope || null
  };
}

exports.handler = async (event) => {
  const query = event.queryStringParameters || {};
  const base = siteUrl();
  const back = (params, target = 'platforms') => ({
    statusCode: 302,
    headers: { Location: `${base}/app?${new URLSearchParams(params)}#/${target}`, 'Cache-Control': 'no-store' }
  });

  const platform = readState(query.state);
  if (!platform || platform !== query.platform || !['youtube', 'tiktok'].includes(platform)) {
    return back({ auth_error: 'The login session expired. Try connecting again.' });
  }
  if (query.error) {
    return back({ auth_error: `${platform} login was cancelled or denied` });
  }
  if (!query.code) {
    return back({ auth_error: 'No authorization code was returned' });
  }

  try {
    const record = platform === 'youtube' ? await exchangeYouTube(query.code, base) : await exchangeTikTok(query.code, base);
    const now = new Date().toISOString();
    const { error } = await supabase()
      .from('platform_tokens')
      .upsert({ platform, ...record, needs_reauth: false, connected_at: now, updated_at: now });
    if (error) throw new Error(error.message);
    return back({ connected: platform }, `${platform}/settings`);
  } catch (err) {
    return back({ auth_error: String(err.message).slice(0, 200) }, `${platform}/settings`);
  }
};
