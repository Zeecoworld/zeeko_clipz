const MINUTE = 60000;
const DAY = 86400000;
const LEAD_MINUTES = 10;
const SLOT_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const DEFAULT_SLOTS = {
  youtube: ['08:00', '11:00', '14:00', '17:00', '20:00'],
  tiktok: ['07:00', '08:30', '10:00', '11:30', '13:00', '14:30', '16:00', '17:30', '19:00', '20:30']
};
const ENV_KEY = { youtube: 'YT_SLOTS', tiktok: 'TIKTOK_SLOTS' };

const toMinutes = (slot) => {
  const match = SLOT_PATTERN.exec(slot);
  return Number(match[1]) * 60 + Number(match[2]);
};

const slotsFor = (platform) => {
  const raw = process.env[ENV_KEY[platform]];
  const custom = raw
    ? raw.split(',').map((item) => item.trim()).filter((item) => SLOT_PATTERN.test(item))
    : [];
  const list = custom.length ? custom : DEFAULT_SLOTS[platform];
  return [...new Set(list)].map(toMinutes).sort((a, b) => a - b);
};

const utcOffsetMinutes = () => {
  const raw = process.env.POSTING_UTC_OFFSET_MINUTES;
  if (!raw) return 60;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 60;
};

const dayIndex = (timestamp, offset) => Math.floor((timestamp + offset * MINUTE) / DAY);
const dayStartUtc = (index, offset) => index * DAY - offset * MINUTE;

function* slotStream(platform, existing, now) {
  const offset = utcOffsetMinutes();
  const slots = slotsFor(platform);
  const cap = slots.length;
  const taken = new Set(existing);
  const perDay = new Map();

  existing.forEach((timestamp) => {
    const key = dayIndex(timestamp, offset);
    perDay.set(key, (perDay.get(key) || 0) + 1);
  });

  const earliest = now + LEAD_MINUTES * MINUTE;
  const firstDay = dayIndex(now, offset);

  for (let day = firstDay; day < firstDay + 4000; day += 1) {
    let used = perDay.get(day) || 0;
    const start = dayStartUtc(day, offset);
    for (const minutes of slots) {
      if (used >= cap) break;
      const timestamp = start + minutes * MINUTE;
      if (timestamp < earliest || taken.has(timestamp)) continue;
      taken.add(timestamp);
      used += 1;
      yield timestamp;
    }
  }
}

const allocateSlots = (platform, count, existing, now = Date.now()) => {
  const result = [];
  for (const timestamp of slotStream(platform, existing, now)) {
    if (result.length >= count) break;
    result.push(timestamp);
  }
  return result;
};

const MAX_POOL = 8000;

const allocateOrdered = (platform, items, existing, now = Date.now()) => {
  const stream = slotStream(platform, existing, now);
  const pool = [];
  const used = [];
  const lastIndex = new Map();
  const result = [];
  let firstFree = 0;

  const poolAt = (index) => {
    while (pool.length <= index) {
      const next = stream.next();
      if (next.done) return null;
      pool.push(next.value);
      used.push(false);
    }
    return pool[index];
  };

  for (const item of items) {
    let index = Math.max(firstFree, lastIndex.has(item.group) ? lastIndex.get(item.group) + 1 : 0);
    let slot = null;
    for (; index < MAX_POOL; index += 1) {
      const timestamp = poolAt(index);
      if (timestamp === null) break;
      if (used[index] || timestamp < (item.notBefore || 0)) continue;
      slot = timestamp;
      used[index] = true;
      lastIndex.set(item.group, index);
      break;
    }
    if (slot === null) return null;
    result.push(slot);
    while (used[firstFree]) firstFree += 1;
  }

  return result;
};

module.exports = { slotsFor, allocateSlots, allocateOrdered, utcOffsetMinutes, dayIndex, dayStartUtc };
