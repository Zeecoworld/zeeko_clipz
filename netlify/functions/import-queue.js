const crypto = require('crypto');
const { json, authorized, supabase } = require('./lib/shared');
const { configureCloudinary, validateSource, buildClips } = require('./lib/clips');
const { slotsFor, allocateOrdered } = require('./lib/slots');
const { planSegments, parseChapters, parseCues } = require('./lib/segments');

const PLATFORMS = ['youtube', 'tiktok'];
const MAX_ROWS = 200;
const MAX_CLIPS = 2000;
const MAX_TRANSCRIPTS = 30;
const DAY_MS = 86400000;
const BLOCKED_HOST = /^(localhost|.*\.local|.*\.internal|\d{1,3}(\.\d{1,3}){3}|\[.*\])$/i;
const ACTIVE = ['scheduled', 'processing', 'published'];

async function pagedSelect(makeQuery) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await makeQuery().range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

async function existingTimes(db, platform) {
  const since = new Date(Date.now() - 2 * DAY_MS).toISOString();
  const rows = await pagedSelect(() =>
    db
      .from('scheduled_posts')
      .select('scheduled_at')
      .eq('platform', platform)
      .in('status', ACTIVE)
      .gte('scheduled_at', since)
      .order('scheduled_at', { ascending: true })
  );
  return rows.map((row) => new Date(row.scheduled_at).getTime());
}

async function otherPlatformTimes(db, platform) {
  const other = platform === 'youtube' ? 'tiktok' : 'youtube';
  const rows = await pagedSelect(() =>
    db
      .from('scheduled_posts')
      .select('clip_key, scheduled_at')
      .eq('platform', other)
      .in('status', ACTIVE)
      .not('clip_key', 'is', null)
      .order('scheduled_at', { ascending: true })
  );
  const map = new Map();
  rows.forEach((row) => {
    const time = new Date(row.scheduled_at).getTime();
    if (!map.has(row.clip_key) || map.get(row.clip_key) < time) map.set(row.clip_key, time);
  });
  return map;
}

async function fetchCues(link) {
  const url = new URL(link);
  if (url.protocol !== 'https:' || BLOCKED_HOST.test(url.hostname)) {
    throw new Error('transcript_url must be a public https link');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > 2000000) throw new Error('file is larger than 2 MB');
    const cues = parseCues(text);
    if (!cues.length) throw new Error('no subtitle cues found (use .srt or .vtt)');
    return cues;
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'download timed out' : err.message);
  } finally {
    clearTimeout(timer);
  }
}

const clipKey = (videoUrl, segment) =>
  crypto.createHash('sha1').update(`${videoUrl}|${segment.start}|${segment.end}`).digest('hex').slice(0, 20);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!authorized(event)) return json(401, { error: 'Invalid app password' });

  const configError = configureCloudinary();
  if (configError) return json(500, { error: configError });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return json(400, { error: 'Request body must be valid JSON' });
  }

  const platform = String(body.platform || '').toLowerCase();
  if (!PLATFORMS.includes(platform)) return json(400, { error: 'Platform must be youtube or tiktok' });

  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return json(400, { error: 'The CSV has no video rows' });
  if (rows.length > MAX_ROWS) return json(400, { error: `A CSV can contain at most ${MAX_ROWS} videos` });

  const order = body.order === 'interleave' ? 'interleave' : 'sequential';
  const stagger = body.stagger === true;
  const minClips = Math.min(6, Math.max(1, Math.floor(Number(body.minClips)) || 3));
  const dryRun = body.dryRun === true;

  const details = [];
  const warnings = [];
  const prepared = [];

  rows.forEach((row, index) => {
    const line = Number.isInteger(row.line) ? row.line : index + 2;
    const videoUrl = String(row.videoUrl || '').trim();
    const duration = Number(row.durationSeconds);
    const problem = validateSource(videoUrl, duration);
    if (problem || !Number.isInteger(duration)) {
      details.push(`Row ${line}: ${problem || 'duration_seconds must be a whole number'}`);
      return;
    }
    const chapterInfo = parseChapters(row.chapters);
    if (chapterInfo.invalid.length) {
      details.push(`Row ${line}: could not read chapter time(s) ${chapterInfo.invalid.slice(0, 3).join(', ')}. Use 0:00;2:10;4:45`);
      return;
    }
    const transcriptUrl = String(row.transcriptUrl || '').trim();
    if (transcriptUrl) {
      try {
        new URL(transcriptUrl);
      } catch (err) {
        details.push(`Row ${line}: transcript_url is not a valid link`);
        return;
      }
    }
    prepared.push({ line, videoUrl, duration, chapters: chapterInfo.values, transcriptUrl, cues: null, row });
  });

  if (details.length) {
    return json(400, { error: 'Fix the CSV and try again', details: details.slice(0, 20) });
  }

  const withTranscripts = prepared.filter((item) => item.transcriptUrl);
  if (withTranscripts.length > MAX_TRANSCRIPTS) {
    return json(400, {
      error: `At most ${MAX_TRANSCRIPTS} rows with a transcript_url can be imported at once. Split the CSV into smaller files.`
    });
  }
  for (let i = 0; i < withTranscripts.length; i += 10) {
    const batch = withTranscripts.slice(i, i + 10);
    const results = await Promise.allSettled(batch.map((item) => fetchCues(item.transcriptUrl)));
    results.forEach((result, j) => {
      if (result.status === 'fulfilled') batch[j].cues = result.value;
      else warnings.push(`Row ${batch[j].line}: transcript skipped (${result.reason.message}). Used chapters or an even split instead.`);
    });
  }

  const methods = { chapters: 0, transcript: 0, even: 0 };
  const rowPosts = prepared.map((item, rowIndex) => {
    const { row } = item;
    const plan = planSegments({ duration: item.duration, chapters: item.chapters, cues: item.cues, minClips });
    methods[plan.method] += 1;
    if (plan.shortfall) {
      warnings.push(`Row ${item.line}: too short for ${minClips} clips of 20+ seconds, made ${plan.segments.length}.`);
    }

    const headline = String(row.headline || '').trim().slice(0, 120);
    const baseTitle = String(row.title || row.headline || 'Clip').trim() || 'Clip';
    const caption = String(row.caption || '').trim().slice(0, 1900);
    const clips = buildClips(item.videoUrl, item.duration, headline, { download: false, segments: plan.segments });
    const total = clips.length;

    return clips.map((clip) => {
      const suffix = total > 1 ? ` - Part ${clip.clipNumber}/${total}` : '';
      const prefix = total > 1 ? `Part ${clip.clipNumber} of ${total}. ` : '';
      return {
        group: rowIndex,
        part: clip.clipNumber,
        video_url: clip.url,
        clip_key: clipKey(item.videoUrl, clip),
        title: `${baseTitle.slice(0, 100 - suffix.length)}${suffix}`,
        caption: `${prefix}${caption}`.trim()
      };
    });
  });

  const ordered = [];
  if (order === 'sequential') {
    rowPosts.forEach((list) => ordered.push(...list));
  } else {
    const longest = Math.max(...rowPosts.map((list) => list.length));
    for (let k = 0; k < longest; k += 1) {
      rowPosts.forEach((list) => {
        if (list[k]) ordered.push(list[k]);
      });
    }
  }

  if (ordered.length > MAX_CLIPS) {
    return json(400, { error: `This import would create ${ordered.length} clips. The limit is ${MAX_CLIPS} per import.` });
  }

  if (dryRun) {
    return json(200, {
      dryRun: true,
      clips: ordered.length,
      perVideo: rowPosts.map((list) => list.length),
      sequence: ordered.slice(0, 70).map((post) => [post.group, post.part]),
      totalSeconds: prepared.reduce((sum, item) => sum + item.duration, 0),
      perDay: slotsFor(platform).length,
      methods,
      warnings: warnings.slice(0, 20)
    });
  }

  let db;
  try {
    db = supabase();
  } catch (err) {
    return json(500, { error: err.message });
  }

  try {
    const taken = await existingTimes(db, platform);
    const otherTimes = stagger ? await otherPlatformTimes(db, platform) : new Map();

    let staggered = 0;
    const items = ordered.map((post) => {
      const other = otherTimes.get(post.clip_key);
      if (other) staggered += 1;
      return { group: post.group, notBefore: other ? other + DAY_MS : 0 };
    });

    const slots = allocateOrdered(platform, items, taken);
    if (!slots) return json(500, { error: 'Could not find enough posting slots' });

    const records = ordered.map((post, i) => ({
      platform,
      video_url: post.video_url,
      clip_key: post.clip_key,
      title: post.title,
      caption: post.caption,
      scheduled_at: new Date(slots[i]).toISOString()
    }));

    const { error } = await db.from('scheduled_posts').insert(records);
    if (error) {
      if (error.code === '23505') {
        return json(409, {
          error:
            'Some of these clips are already queued for this platform (same video, headline and cut points). Cancel the existing ones or remove the duplicate rows.'
        });
      }
      return json(500, { error: error.message });
    }

    return json(200, {
      imported: records.length,
      perDay: slotsFor(platform).length,
      firstPostAt: new Date(Math.min(...slots)).toISOString(),
      lastPostAt: new Date(Math.max(...slots)).toISOString(),
      methods,
      staggered,
      warnings: warnings.slice(0, 20)
    });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
