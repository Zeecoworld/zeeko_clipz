const TARGET = 60;
const MIN = 40;
const MAX = 90;
const MIN_SPLIT = 20;

const round = (value) => Math.round(value * 100) / 100;

const parseClock = (value) => {
  const text = String(value).trim();
  if (!text) return NaN;
  if (!text.includes(':')) return Number(text);
  const parts = text.split(':').map(Number);
  if (parts.length > 3 || parts.some((part) => !Number.isFinite(part) || part < 0)) return NaN;
  return parts.reduce((total, part) => total * 60 + part, 0);
};

const parseChapters = (text) => {
  const values = [];
  const invalid = [];
  String(text || '')
    .split(/[;,|]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const seconds = parseClock(item);
      if (Number.isFinite(seconds) && seconds >= 0) values.push(seconds);
      else invalid.push(item);
    });
  return { values, invalid };
};

const TIME = '(?:\\d+:)?\\d{1,2}:\\d{2}[.,]\\d{1,3}';
const ARROW = new RegExp(`(${TIME})\\s*-->\\s*(${TIME})`);

const parseCues = (text) => {
  const cues = [];
  String(text)
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .forEach((block) => {
      const lines = block.split('\n');
      const index = lines.findIndex((line) => ARROW.test(line));
      if (index < 0) return;
      const match = ARROW.exec(lines[index]);
      const start = parseClock(match[1].replace(',', '.'));
      const end = parseClock(match[2].replace(',', '.'));
      const body = lines.slice(index + 1).join(' ').replace(/<[^>]+>/g, '').trim();
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        cues.push({ start, end, sentence: /[.!?\u2026]["')\]]*$/.test(body) });
      }
    });
  cues.sort((a, b) => a.start - b.start);
  return cues.map((cue, i) => ({
    ...cue,
    gap: i + 1 < cues.length ? Math.max(0, cues[i + 1].start - cue.end) : 0
  }));
};

const splitRange = (start, end, cues) => {
  const length = end - start;

  if (!cues || !cues.length) {
    if (length <= TARGET) return [{ start: round(start), end: round(end) }];
    const count = Math.ceil(length / TARGET);
    const step = length / count;
    return Array.from({ length: count }, (_, i) => ({
      start: round(start + i * step),
      end: i === count - 1 ? round(end) : round(start + (i + 1) * step)
    }));
  }

  const out = [];
  let from = start;
  while (end - from > MAX) {
    const remaining = end - from;
    const low = from + MIN;
    const high = from + Math.min(MAX, remaining - MIN);
    let best = null;
    let bestScore = Infinity;
    for (const cue of cues) {
      const point = cue.end + Math.min(cue.gap / 2, 0.4);
      if (point < low || point > high) continue;
      const score = Math.abs(point - from - TARGET) - 6 * Math.min(cue.gap, 1.5) - (cue.sentence ? 6 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = point;
      }
    }
    const cut = round(best !== null ? best : from + Math.min(TARGET, remaining - MIN));
    out.push({ start: round(from), end: cut });
    from = cut;
  }
  out.push({ start: round(from), end: round(end) });
  return out;
};

const evenSplit = (start, end, count) => {
  const step = (end - start) / count;
  return Array.from({ length: count }, (_, i) => ({
    start: round(start + i * step),
    end: i === count - 1 ? round(end) : round(start + (i + 1) * step)
  }));
};

const ensureMinClips = (segments, minClips, cues) => {
  const out = segments.map((segment) => ({ ...segment }));
  while (out.length < minClips) {
    let index = 0;
    out.forEach((segment, i) => {
      if (segment.end - segment.start > out[index].end - out[index].start) index = i;
    });
    const target = out[index];
    if (target.end - target.start < MIN_SPLIT * 2) break;

    const middle = (target.start + target.end) / 2;
    let cut = middle;
    if (cues && cues.length) {
      let bestScore = Infinity;
      for (const cue of cues) {
        const point = cue.end + Math.min(cue.gap / 2, 0.4);
        if (point < target.start + MIN_SPLIT || point > target.end - MIN_SPLIT) continue;
        const score = Math.abs(point - middle) - 6 * Math.min(cue.gap, 1.5) - (cue.sentence ? 6 : 0);
        if (score < bestScore) {
          bestScore = score;
          cut = point;
        }
      }
    }
    cut = round(cut);
    out.splice(index, 1, { start: target.start, end: cut }, { start: cut, end: target.end });
  }
  return out;
};

const planSegments = ({ duration, chapters, cues, minClips = 1 }) => {
  const hasChapters = Array.isArray(chapters) && chapters.some((c) => c > 0 && c < duration);
  const hasCues = Array.isArray(cues) && cues.length > 0;

  if (hasChapters) {
    const starts = [...new Set([0, ...chapters.filter((c) => c > 0 && c < duration)])].sort((a, b) => a - b);
    const parts = starts.map((s, i) => ({ start: s, end: i + 1 < starts.length ? starts[i + 1] : duration }));

    const merged = [];
    for (const part of parts) {
      const current = merged[merged.length - 1];
      if (current && current.end - current.start < MIN) current.end = part.end;
      else merged.push({ ...part });
    }
    const last = merged[merged.length - 1];
    if (merged.length > 1 && last.end - last.start < MIN) {
      merged.pop();
      merged[merged.length - 1].end = last.end;
    }

    const segments = merged.flatMap((part) =>
      part.end - part.start > MAX ? splitRange(part.start, part.end, hasCues ? cues : null) : [{ start: round(part.start), end: round(part.end) }]
    );
    const finalSegments = ensureMinClips(segments, minClips, hasCues ? cues : null);
    return { segments: finalSegments, method: 'chapters', shortfall: finalSegments.length < minClips };
  }

  if (hasCues) {
    const segments = ensureMinClips(splitRange(0, duration, cues), minClips, cues);
    return { segments, method: 'transcript', shortfall: segments.length < minClips };
  }

  const count = Math.max(1, Math.ceil(duration / TARGET), Math.min(minClips, Math.floor(duration / MIN_SPLIT)));
  const segments = evenSplit(0, duration, count);
  return { segments, method: 'even', shortfall: segments.length < minClips };
};

module.exports = { planSegments, parseChapters, parseCues, parseClock, TARGET, MIN, MAX, MIN_SPLIT };
