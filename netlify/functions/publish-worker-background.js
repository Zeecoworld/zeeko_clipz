const { authorized, supabase, tiktokMode } = require('./lib/shared');
const { getAccessToken } = require('./lib/tokens');

const MAX_ATTEMPTS = 8;

class RetryLater extends Error {
  constructor(message, minutes) {
    super(message);
    this.retryMinutes = minutes;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function downloadVideo(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const res = await fetch(url);
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status === 423 || res.status === 202) {
      await sleep(15000);
      continue;
    }
    const reason = res.headers.get('x-cld-error') || '';
    throw new Error(`Video download failed (${res.status}) ${reason}`.trim());
  }
  throw new Error('Cloudinary did not finish rendering the clip in time');
}

async function uploadToYouTube(db, row, video) {
  const token = await getAccessToken(db, 'youtube');
  const description = `${row.caption || ''}\n\n#Shorts`.trim();

  const init = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(video.length),
        'X-Upload-Content-Type': 'video/mp4'
      },
      body: JSON.stringify({
        snippet: {
          title: row.title.slice(0, 100),
          description,
          categoryId: process.env.YT_CATEGORY_ID || '22'
        },
        status: {
          privacyStatus: process.env.YT_PRIVACY_STATUS || 'public',
          selfDeclaredMadeForKids: false
        }
      })
    }
  );
  if (!init.ok) {
    const text = await init.text();
    if (init.status === 403 && text.includes('quotaExceeded')) {
      throw new RetryLater('YouTube daily quota reached. Retrying in 3 hours.', 180);
    }
    throw new Error(`YouTube upload init failed (${init.status}): ${text.slice(0, 300)}`);
  }
  const uploadUrl = init.headers.get('location');
  if (!uploadUrl) throw new Error('YouTube did not return an upload URL');

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4' },
    body: video
  });
  const data = await put.json().catch(() => ({}));
  if (!put.ok || !data.id) {
    throw new Error(`YouTube upload failed (${put.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data.id;
}

async function tiktokPrivacy(token) {
  const wanted = process.env.TIKTOK_PRIVACY_LEVEL || 'SELF_ONLY';
  let options = null;
  try {
    const res = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: '{}'
    });
    const data = await res.json();
    options = data && data.data && data.data.privacy_level_options;
  } catch (err) {
    options = null;
  }
  if (Array.isArray(options) && options.length && !options.includes(wanted)) {
    throw new Error(`TikTok privacy level ${wanted} is not available for this account (options: ${options.join(', ')})`);
  }
  return wanted;
}

async function waitForTikTok(token, publishId, doneStatuses) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await sleep(10000);
    const res = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ publish_id: publishId })
    });
    const data = await res.json().catch(() => ({}));
    const status = data.data && data.data.status;
    if (doneStatuses.includes(status)) return;
    if (status === 'FAILED') {
      throw new Error(`TikTok rejected the video: ${data.data.fail_reason || 'unknown reason'}`);
    }
  }
}

async function uploadToTikTok(db, row, video) {
  if (video.length > 64 * 1024 * 1024) {
    throw new Error("Clip is larger than TikTok's 64 MB single-chunk limit");
  }
  const mode = tiktokMode();
  const token = await getAccessToken(db, 'tiktok');

  const sourceInfo = {
    source: 'FILE_UPLOAD',
    video_size: video.length,
    chunk_size: video.length,
    total_chunk_count: 1
  };

  let endpoint;
  let body;
  if (mode === 'direct') {
    endpoint = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
    body = {
      post_info: {
        title: `${row.title} ${row.caption || ''}`.trim().slice(0, 2200),
        privacy_level: await tiktokPrivacy(token),
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false
      },
      source_info: sourceInfo
    };
  } else {
    endpoint = 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/';
    body = { source_info: sourceInfo };
  }

  const init = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body)
  });
  const initData = await init.json().catch(() => ({}));
  const code = initData.error && initData.error.code;

  if (code === 'spam_risk_too_many_pending_share') {
    throw new RetryLater(
      'Waiting: TikTok already has 5 unposted clips in your inbox. Publish or discard some in TikTok.',
      60
    );
  }
  if (code === 'spam_risk_too_many_posts') {
    throw new RetryLater('Waiting: TikTok daily posting limit reached for this account.', 180);
  }
  if (!init.ok || (code && code !== 'ok') || !initData.data) {
    const detail = initData.error ? `${code}: ${initData.error.message}` : init.status;
    throw new Error(`TikTok init failed: ${detail}`);
  }

  const { upload_url: uploadUrl, publish_id: publishId } = initData.data;
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes 0-${video.length - 1}/${video.length}`
    },
    body: video
  });
  if (!put.ok) throw new Error(`TikTok upload failed (${put.status})`);

  await waitForTikTok(
    token,
    publishId,
    mode === 'direct' ? ['PUBLISH_COMPLETE'] : ['SEND_TO_USER_INBOX', 'PUBLISH_COMPLETE']
  );
  return { id: publishId, note: mode === 'draft' ? 'Delivered to your TikTok inbox. Open TikTok to finish posting.' : null };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST' || !authorized(event)) {
    return { statusCode: 401 };
  }

  let id;
  try {
    id = JSON.parse(event.body || '{}').id;
  } catch (err) {
    return { statusCode: 400 };
  }
  if (!id) return { statusCode: 400 };

  const db = supabase();
  const { data: row } = await db.from('scheduled_posts').select('*').eq('id', id).maybeSingle();
  if (!row || row.status !== 'processing') return { statusCode: 200 };

  try {
    const video = await downloadVideo(row.video_url);
    let externalId;
    let note = null;
    if (row.platform === 'youtube') {
      externalId = await uploadToYouTube(db, row, video);
    } else {
      const result = await uploadToTikTok(db, row, video);
      externalId = result.id;
      note = result.note;
    }
    await db
      .from('scheduled_posts')
      .update({
        status: 'published',
        external_id: externalId,
        published_at: new Date().toISOString(),
        error: null,
        note
      })
      .eq('id', id);
  } catch (err) {
    const attempts = (row.attempts || 0) + 1;
    if (err.retryMinutes && attempts < MAX_ATTEMPTS) {
      await db
        .from('scheduled_posts')
        .update({
          status: 'scheduled',
          scheduled_at: new Date(Date.now() + err.retryMinutes * 60000).toISOString(),
          started_at: null,
          attempts,
          error: null,
          note: err.message
        })
        .eq('id', id);
    } else {
      await db
        .from('scheduled_posts')
        .update({ status: 'failed', attempts, error: String(err.message).slice(0, 500) })
        .eq('id', id);
    }
  }

  return { statusCode: 200 };
};
