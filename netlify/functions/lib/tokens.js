const LABELS = { youtube: 'YouTube', tiktok: 'TikTok' };

const form = (values) => new URLSearchParams(values);

async function refreshYouTube(row) {
  const { YT_CLIENT_ID, YT_CLIENT_SECRET } = process.env;
  if (!YT_CLIENT_ID || !YT_CLIENT_SECRET) {
    return { ok: false, status: 0, message: 'YT_CLIENT_ID or YT_CLIENT_SECRET is missing' };
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({
      client_id: YT_CLIENT_ID,
      client_secret: YT_CLIENT_SECRET,
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    return { ok: false, status: res.status, message: data.error_description || data.error || `HTTP ${res.status}` };
  }
  return {
    ok: true,
    update: {
      access_token: data.access_token,
      expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()
    }
  };
}

async function refreshTikTok(row) {
  const { TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET } = process.env;
  if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) {
    return { ok: false, status: 0, message: 'TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET is missing' };
  }
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    return { ok: false, status: res.status, message: data.error_description || data.error || `HTTP ${res.status}` };
  }
  return {
    ok: true,
    update: {
      access_token: data.access_token,
      refresh_token: data.refresh_token || row.refresh_token,
      expires_at: new Date(Date.now() + (data.expires_in || 86400) * 1000).toISOString()
    }
  };
}

async function getAccessToken(db, platform) {
  const label = LABELS[platform];
  const { data: row } = await db.from('platform_tokens').select('*').eq('platform', platform).maybeSingle();
  if (!row) throw new Error(`${label} is not connected. Connect it in the app first.`);

  if (row.access_token && row.expires_at && new Date(row.expires_at).getTime() - Date.now() > 60000) {
    return row.access_token;
  }

  const result = platform === 'youtube' ? await refreshYouTube(row) : await refreshTikTok(row);
  if (!result.ok) {
    if (result.status === 400 || result.status === 401) {
      await db.from('platform_tokens').update({ needs_reauth: true }).eq('platform', platform);
    }
    throw new Error(`${label} login expired or was revoked (${result.message}). Reconnect it in the app.`);
  }

  await db
    .from('platform_tokens')
    .update({ ...result.update, needs_reauth: false, updated_at: new Date().toISOString() })
    .eq('platform', platform);
  return result.update.access_token;
}

module.exports = { getAccessToken };
