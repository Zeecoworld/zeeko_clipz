import {clean} from './spec.mjs';

// The rows Clip Studio's importer expects, with the title and description already written.
export const buildRows = (videos, platform) =>
  videos.map((video, index) => ({
    line: index + 2,
    videoUrl: video.url,
    durationSeconds: Math.max(1, Math.round(video.seconds)),
    title: clean(video.meta.title, platform === 'tiktok' ? 90 : 100),
    caption:
      platform === 'youtube'
        ? `${video.meta.description}\n\n${video.meta.hashtags.join(' ')}`.slice(0, 1900)
        : video.meta.hashtags.join(' ')
  }));

export const importToApp = async ({appUrl, password, platform, videos}) => {
  const res = await fetch(`${appUrl.replace(/\/$/, '')}/.netlify/functions/import-queue`, {
    method: 'POST',
    headers: {'content-type': 'application/json', 'x-app-key': password},
    body: JSON.stringify({platform, rows: buildRows(videos, platform), minClips: 1, order: 'sequential', stagger: true}),
    signal: AbortSignal.timeout(60000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = Array.isArray(data.details) ? ` (${data.details.join('; ')})` : '';
    throw new Error(`Clip Studio answered ${res.status}: ${data.error || 'unknown error'}${details}`);
  }
  return data;
};
