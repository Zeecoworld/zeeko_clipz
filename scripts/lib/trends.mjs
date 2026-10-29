// What is popular on YouTube right now (needs a free YouTube Data API key in YT_API_KEY).
// The factory still works without it, it just writes scripts without trend hints.
export const fetchTrends = async ({apiKey, region = 'US', log = console.log}) => {
  if (!apiKey) {
    log('trends: YT_API_KEY is not set, skipping trend hints');
    return {titles: [], tags: []};
  }
  const base = `https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&maxResults=30&regionCode=${encodeURIComponent(region)}&key=${encodeURIComponent(apiKey)}`;
  // Category 28 is Science & Technology. Some regions do not offer a chart for it, so fall back to the general chart.
  for (const url of [`${base}&videoCategoryId=28`, base]) {
    try {
      const res = await fetch(url, {signal: AbortSignal.timeout(15000)});
      if (!res.ok) continue;
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) continue;
      const titles = items.slice(0, 20).map((item) => String(item.snippet?.title || '').slice(0, 100)).filter(Boolean);
      const counts = new Map();
      for (const item of items) {
        for (const tag of item.snippet?.tags || []) {
          const key = String(tag).toLowerCase().trim();
          if (key && key.length <= 30) counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
      const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag]) => tag);
      log(`trends: ${titles.length} trending titles (${url.includes('videoCategoryId') ? 'tech chart' : 'general chart'}, region ${region})`);
      return {titles, tags};
    } catch (err) {
      log(`trends: request failed (${err.message})`);
    }
  }
  return {titles: [], tags: []};
};
