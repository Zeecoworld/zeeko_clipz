const cloudinary = require('cloudinary').v2;

const CLIP_LENGTH = 60;
const MAX_TOTAL_SECONDS = 7200;

const configureCloudinary = () => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return 'Cloudinary environment variables are missing';
  }
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true
  });
  return null;
};

const validateSource = (videoUrl, totalDuration) => {
  try {
    const parsed = new URL(videoUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return 'The video URL must start with http:// or https://';
    }
  } catch (err) {
    return 'Enter a valid direct video URL';
  }
  if (!Number.isFinite(totalDuration) || totalDuration < 1) {
    return 'Duration must be at least 1 second';
  }
  if (totalDuration > MAX_TOTAL_SECONDS) {
    return `Duration is capped at ${MAX_TOTAL_SECONDS} seconds`;
  }
  return null;
};

const round = (value) => Math.round(value * 100) / 100;

const fixedSegments = (totalDuration) => {
  const segments = [];
  for (let start = 0; start < totalDuration; start += CLIP_LENGTH) {
    segments.push({ start, end: Math.min(start + CLIP_LENGTH, totalDuration) });
  }
  return segments;
};

const buildClips = (videoUrl, totalDuration, headline, options = {}) => {
  const includeDownload = options.download !== false;
  const segments = options.segments || fixedSegments(totalDuration);

  return segments.map((segment, index) => {
    const clipNumber = index + 1;
    const currentClipDuration = round(segment.end - segment.start);

    const steps = [
      { start_offset: segment.start, duration: currentClipDuration },
      { aspect_ratio: '9:16', crop: 'pad', width: 720, background: 'blurred:1000:6' }
    ];

    if (headline) {
      steps.push({
        overlay: {
          font_family: 'Arial',
          font_size: 40,
          font_weight: 'bold',
          text_align: 'center',
          text: headline
        },
        gravity: 'north',
        y: 100,
        color: 'white',
        width: 620,
        crop: 'fit'
      });
    }

    const finish = { quality: 'auto', fetch_format: 'mp4' };
    const build = (lastStep) =>
      cloudinary.url(videoUrl, {
        type: 'fetch',
        resource_type: 'video',
        sign_url: true,
        secure: true,
        transformation: [...steps, lastStep]
      });

    const clip = {
      clipNumber,
      start: segment.start,
      end: segment.end,
      timeframe: `${segment.start}s - ${segment.end}s`,
      url: build(finish)
    };
    if (includeDownload) {
      clip.downloadUrl = build({ ...finish, flags: `attachment:clip_${clipNumber}` });
    }
    return clip;
  });
};

module.exports = { configureCloudinary, validateSource, buildClips, MAX_TOTAL_SECONDS };
