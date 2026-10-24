const { supabase } = require('./lib/shared');

exports.handler = async () => {
  const db = supabase();
  const now = new Date();

  const staleBefore = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  await db
    .from('scheduled_posts')
    .update({ status: 'failed', error: 'Timed out while publishing' })
    .eq('status', 'processing')
    .lt('started_at', staleBefore);

  const due = [];
  for (const platform of ['youtube', 'tiktok']) {
    const { data, error } = await db
      .from('scheduled_posts')
      .select('id')
      .eq('platform', platform)
      .eq('status', 'scheduled')
      .lte('scheduled_at', now.toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(5);
    if (error) {
      console.error(`Could not load due ${platform} posts:`, error.message);
      continue;
    }
    due.push(...(data || []));
  }

  const baseUrl = process.env.SITE_URL || process.env.URL;

  for (const row of due) {
    const { data: claimed } = await db
      .from('scheduled_posts')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'scheduled')
      .select('id');
    if (!claimed || !claimed.length) continue;

    try {
      const res = await fetch(`${baseUrl}/.netlify/functions/publish-worker-background`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-key': process.env.APP_PASSWORD || ''
        },
        body: JSON.stringify({ id: row.id })
      });
      if (!res.ok) throw new Error(`Worker responded with ${res.status}`);
    } catch (err) {
      await db
        .from('scheduled_posts')
        .update({ status: 'failed', error: String(err.message).slice(0, 500) })
        .eq('id', row.id);
    }
  }

  return { statusCode: 200 };
};
