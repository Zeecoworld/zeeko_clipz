const FIRST_CHUNK = 262144;
const MAX_MOOV = 24 * 1024 * 1024;
const MAX_SCAN = 4 * 1024 * 1024;
const TIMEOUT_MS = 6000;

async function readRange(url, start, end) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=${start}-${end}` },
      signal: controller.signal,
      redirect: 'follow'
    });

    if (res.status === 206) {
      const match = /\/(\d+)\s*$/.exec(res.headers.get('content-range') || '');
      return { buffer: Buffer.from(await res.arrayBuffer()), total: match ? Number(match[1]) : null, ranged: true };
    }

    if (res.status === 200) {
      if (start !== 0) throw new Error('the server ignores range requests');
      const reader = res.body.getReader();
      const chunks = [];
      let size = 0;
      while (size < MAX_SCAN) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
        size += value.length;
      }
      reader.cancel().catch(() => {});
      return { buffer: Buffer.concat(chunks), total: Number(res.headers.get('content-length')) || null, ranged: false };
    }

    throw new Error(`the server answered HTTP ${res.status}`);
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'the server took too long to respond' : err.message);
  } finally {
    clearTimeout(timer);
  }
}

const boxes = (buffer) => {
  const out = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      size = Number(buffer.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = buffer.length - offset;
    }
    if (size < header) break;
    out.push({ type, body: buffer.subarray(offset + header, Math.min(offset + size, buffer.length)) });
    offset += size;
  }
  return out;
};

const durationFromMoov = (moov) => {
  const children = boxes(moov);
  const mvhd = children.find((box) => box.type === 'mvhd');
  if (!mvhd) throw new Error('the MP4 has no duration header');

  const version = mvhd.body[0];
  const timescale = mvhd.body.readUInt32BE(version === 1 ? 20 : 12);
  const rawDuration = version === 1 ? Number(mvhd.body.readBigUInt64BE(24)) : mvhd.body.readUInt32BE(16);
  if (!timescale) throw new Error('the MP4 has an invalid timescale');

  let seconds = rawDuration / timescale;
  if (!rawDuration || rawDuration === 0xffffffff) {
    const mvex = children.find((box) => box.type === 'mvex');
    const mehd = mvex && boxes(mvex.body).find((box) => box.type === 'mehd');
    if (mehd) {
      const fragment = mehd.body[0] === 1 ? Number(mehd.body.readBigUInt64BE(4)) : mehd.body.readUInt32BE(4);
      seconds = fragment / timescale;
    }
  }
  if (!Number.isFinite(seconds) || seconds < 1) throw new Error('the video length could not be read from the file');
  return seconds;
};

async function probeDuration(url) {
  const first = await readRange(url, 0, FIRST_CHUNK - 1);
  let buffer = first.buffer;
  let bufferStart = 0;
  let offset = 0;

  for (let hop = 0; hop < 24; hop += 1) {
    if (offset < bufferStart || offset + 16 > bufferStart + buffer.length) {
      if (!first.ranged) {
        throw new Error('the length is stored at the end of the file and the server does not allow partial downloads');
      }
      if (first.total && offset >= first.total) break;
      const next = await readRange(url, offset, offset + FIRST_CHUNK - 1);
      buffer = next.buffer;
      bufferStart = offset;
    }

    const at = offset - bufferStart;
    if (buffer.length < at + 8) break;

    let size = buffer.readUInt32BE(at);
    const type = buffer.toString('latin1', at + 4, at + 8);
    let header = 8;
    if (size === 1) {
      size = Number(buffer.readBigUInt64BE(at + 8));
      header = 16;
    } else if (size === 0) {
      size = (first.total || 0) - offset;
    }
    if (!size || size < header) throw new Error('this does not look like an MP4 file');

    if (type === 'moov') {
      if (at + size <= buffer.length) return durationFromMoov(buffer.subarray(at + header, at + size));
      if (size > MAX_MOOV || !first.ranged) throw new Error('the video metadata is too large to read');
      const whole = await readRange(url, offset, offset + size - 1);
      return durationFromMoov(whole.buffer.subarray(header, size));
    }

    offset += size;
    if (first.total && offset >= first.total) break;
  }

  throw new Error('could not find the video length (use an MP4 or MOV link, or add duration_seconds)');
}

module.exports = { probeDuration, durationFromMoov };
