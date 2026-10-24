const { json, authorized, supabase } = require('./lib/shared');
const { slotsFor, utcOffsetMinutes, dayIndex, dayStartUtc } = require('./lib/slots');

const PLATFORMS = ['youtube', 'tiktok'];
const STATUSES = ['scheduled', 'processing', 'published', 'failed', 'cancelled'];
const COLUMNS = 'id, platform, title, scheduled_at, status, error, note, external_id, published_at';
const MINUTE = 60000;

const pad = (n) => String(n).padStart(2, '0');
const slotLabel = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

async function dashboard(db, platform) {
  const offset = utcOffsetMinutes();
  const today = dayIndex(Date.now(), offset);
  const windowStart = new Date(dayStartUtc(today - 6, offset)).toISOString();
  const windowEnd = new Date(dayStartUtc(today + 14, offset)).toISOString();

  const results = await Promise.all([
    ...STATUSES.map((status) =>
      db.from('scheduled_posts').select('id', { count: 'exact', head: true }).eq('platform', platform).eq('status', status)
    ),
    db
      .from('scheduled_posts')
      .select('scheduled_at')
      .eq('platform', platform)
      .eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true })
      .limit(1),
    db
      .from('scheduled_posts')
      .select('scheduled_at, status')
      .eq('platform', platform)
      .in('status', ['scheduled', 'processing', 'published', 'failed'])
      .gte('scheduled_at', windowStart)
      .lt('scheduled_at', windowEnd)
      .order('scheduled_at', { ascending: true })
      .limit(1000)
  ]);

  const failed = results.find((result) => result.error);
  if (failed) throw new Error(failed.error.message);

  const counts = {};
  STATUSES.forEach((status, i) => {
    counts[status] = results[i].count || 0;
  });
  const next = results[STATUSES.length].data;
  const rows = results[STATUSES.length + 1].data || [];

  const days = new Map();
  for (let index = today - 6; index < today + 14; index += 1) {
    const date = new Date(dayStartUtc(index, offset) + offset * MINUTE).toISOString().slice(0, 10);
    days.set(index, { date, published: 0, scheduled: 0, failed: 0 });
  }
  rows.forEach((row) => {
    const entry = days.get(dayIndex(new Date(row.scheduled_at).getTime(), offset));
    if (!entry) return;
    if (row.status === 'published') entry.published += 1;
    else if (row.status === 'failed') entry.failed += 1;
    else entry.scheduled += 1;
  });

  const daily = [...days.values()];
  const todayEntry = days.get(today);
  const perDay = slotsFor(platform).length;

  return {
    platform,
    perDay,
    slots: slotsFor(platform).map(slotLabel),
    utcOffsetMinutes: offset,
    counts,
    nextAt: next && next[0] ? next[0].scheduled_at : null,
    todayDate: todayEntry.date,
    today: todayEntry,
    daysLeft: Math.round((counts.scheduled / perDay) * 10) / 10,
    daily
  };
}

exports.handler = async (event) => {
  if (!authorized(event)) return json(401, { error: 'Invalid or expired session' });

  let db;
  try {
    db = supabase();
  } catch (err) {
    return json(500, { error: err.message });
  }

  const query = event.queryStringParameters || {};

  if (event.httpMethod === 'GET') {
    if (!PLATFORMS.includes(query.platform)) return json(400, { error: 'Unknown platform' });

    if (query.status) {
      const statuses = query.status === 'upcoming' ? ['scheduled', 'processing'] : [query.status];
      if (!statuses.every((status) => STATUSES.includes(status))) return json(400, { error: 'Unknown status' });
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
      const offset = Math.max(0, Number(query.offset) || 0);
      const ascending = query.status === 'upcoming' || query.status === 'scheduled';
      const { data, error, count } = await db
        .from('scheduled_posts')
        .select(COLUMNS, { count: 'exact' })
        .eq('platform', query.platform)
        .in('status', statuses)
        .order('scheduled_at', { ascending })
        .range(offset, offset + limit - 1);
      if (error) return json(500, { error: error.message });
      return json(200, { posts: data, total: count == null ? data.length : count });
    }

    try {
      return json(200, await dashboard(db, query.platform));
    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (err) {
      return json(400, { error: 'Request body must be valid JSON' });
    }
    const retryAt = new Date(Date.now() + 2 * MINUTE).toISOString();
    const reset = { status: 'scheduled', scheduled_at: retryAt, error: null, note: 'Retry queued', attempts: 0, started_at: null };

    if (body.action === 'retry' && body.id) {
      const { data, error } = await db
        .from('scheduled_posts')
        .update(reset)
        .eq('id', body.id)
        .eq('status', 'failed')
        .select('id');
      if (error) return json(500, { error: error.message });
      if (!data.length) return json(409, { error: 'Only failed posts can be retried' });
      return json(200, { retried: 1 });
    }

    if (body.action === 'retryAll' && PLATFORMS.includes(body.platform)) {
      const { data, error } = await db
        .from('scheduled_posts')
        .update(reset)
        .eq('platform', body.platform)
        .eq('status', 'failed')
        .select('id');
      if (error) return json(500, { error: error.message });
      return json(200, { retried: data.length });
    }

    return json(400, { error: 'Unknown action' });
  }

  if (event.httpMethod === 'DELETE') {
    const { id, platform, all } = query;

    if (all && PLATFORMS.includes(platform)) {
      const { data, error } = await db
        .from('scheduled_posts')
        .update({ status: 'cancelled' })
        .eq('platform', platform)
        .eq('status', 'scheduled')
        .select('id');
      if (error) return json(500, { error: error.message });
      return json(200, { cancelled: data.length });
    }

    if (!id) return json(400, { error: 'Missing id' });
    const { data, error } = await db
      .from('scheduled_posts')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('status', 'scheduled')
      .select('id');
    if (error) return json(500, { error: error.message });
    if (!data.length) return json(409, { error: 'Only posts that are still scheduled can be cancelled' });
    return json(200, { cancelled: 1 });
  }

  return json(405, { error: 'Method not allowed' });
};
