// The daily job: find trending topics, write scripts with Gemini, render the videos with Remotion,
// upload them to Cloudinary and schedule them in Clip Studio. Run with: npm run factory
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {askGemini, buildPrompt, parseVideos} from './lib/gemini.mjs';
import {fetchTrends} from './lib/trends.mjs';
import {cleanVideo, normalizeHook} from './lib/spec.mjs';
import {loadHistory, saveHistory} from './lib/history.mjs';
import {renderVideo} from './lib/render.mjs';
import {slug, uploadVideo} from './lib/cloudinary.mjs';
import {importToApp} from './lib/clipstudio.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export const configFromEnv = (env = process.env) => ({
  count: Math.min(10, Math.max(1, Number(env.VIDEOS_PER_RUN) || 5)),
  platforms: String(env.PLATFORMS || 'youtube,tiktok').split(',').map((p) => p.trim().toLowerCase()).filter((p) => ['youtube', 'tiktok'].includes(p)),
  dryRun: env.DRY_RUN === 'true',
  brand: env.BRAND || 'Zeecomedia Tech',
  cta: env.CTA || 'Follow for daily coding tips',
  region: env.YT_TREND_REGION || 'US',
  geminiKey: env.GEMINI_API_KEY || '',
  geminiModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
  ytKey: env.YT_API_KEY || '',
  cloud: {cloudName: env.CLOUDINARY_CLOUD_NAME || '', apiKey: env.CLOUDINARY_API_KEY || '', apiSecret: env.CLOUDINARY_API_SECRET || ''},
  appUrl: env.APP_URL || '',
  appPassword: env.APP_PASSWORD || '',
  historyFile: path.join(root, 'data', 'history.json'),
  outDir: path.join(root, 'out', 'videos')
});

const realDeps = {
  fetchTrends,
  askGemini,
  renderVideo,
  uploadVideo,
  importToApp,
  ensureMusic: () => {
    if (!fs.existsSync(path.join(root, 'public', 'music', 'track0.wav'))) {
      execFileSync(process.execPath, [path.join(root, 'scripts', 'make-music.mjs')], {stdio: 'inherit'});
    }
  }
};

export async function run(config, deps = realDeps, log = console.log) {
  const problems = [];
  if (!config.geminiKey) problems.push('GEMINI_API_KEY');
  if (!config.platforms.length) problems.push('PLATFORMS (youtube and/or tiktok)');
  if (!config.dryRun) {
    if (!config.cloud.cloudName || !config.cloud.apiKey || !config.cloud.apiSecret) problems.push('CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
    if (!config.appUrl) problems.push('APP_URL');
    if (!config.appPassword) problems.push('APP_PASSWORD');
  }
  if (problems.length) throw new Error(`Missing settings: ${problems.join('; ')}`);

  const history = loadHistory(config.historyFile);
  const trends = await deps.fetchTrends({apiKey: config.ytKey, region: config.region, log});

  // 1. Scripts. Ask for a few extra so that some can be rejected by the checks.
  const wanted = config.count;
  const prompt = buildPrompt({count: Math.min(12, wanted + 3), trends, history: history.slice(-40).map((h) => h.hook), brand: config.brand});
  const text = await deps.askGemini({apiKey: config.geminiKey, prompt, model: config.geminiModel, log});
  const raw = parseVideos(text);
  log(`scripts: ${raw.length} written by the AI`);

  const seen = new Set(history.map((h) => normalizeHook(h.hook)));
  const firstAccent = Math.floor(Math.random() * 4);
  const scripts = [];
  for (const item of raw) {
    if (scripts.length >= wanted) break;
    try {
      const made = cleanVideo(item, {accent: (firstAccent + scripts.length) % 4, music: Math.floor(Math.random() * 3), brand: config.brand, cta: config.cta});
      const key = normalizeHook(made.spec.hook);
      if (seen.has(key)) throw new Error('same topic as a recent video');
      seen.add(key);
      scripts.push(made);
    } catch (err) {
      log(`scripts: skipped "${String(item && item.hook).slice(0, 50)}" (${err.message})`);
    }
  }
  if (!scripts.length) throw new Error('None of the scripts passed the checks');
  log(`scripts: ${scripts.length} accepted`);

  // 2. Render.
  deps.ensureMusic();
  fs.mkdirSync(config.outDir, {recursive: true});
  const stamp = new Date().toISOString().slice(0, 10);
  const made = [];
  for (let i = 0; i < scripts.length; i += 1) {
    const {spec, meta} = scripts[i];
    const output = path.join(config.outDir, `${stamp}-${String(i + 1).padStart(2, '0')}-${slug(spec.hook)}.mp4`);
    try {
      log(`video ${i + 1}/${scripts.length}: ${spec.template} "${spec.hook}"`);
      const rendered = await deps.renderVideo({spec, output, log});
      made.push({spec, meta, file: rendered.file, seconds: rendered.seconds});
    } catch (err) {
      log(`video ${i + 1}: render failed (${err.message})`);
    }
  }
  if (!made.length) throw new Error('No video could be rendered');

  const summary = {rendered: made.length, uploaded: 0, imports: {}};
  if (config.dryRun) {
    log(`dry run: ${made.length} videos rendered, nothing uploaded`);
    return {...summary, videos: made};
  }

  // 3. Upload.
  const uploaded = [];
  for (const video of made) {
    try {
      const result = await deps.uploadVideo({file: video.file, name: video.spec.hook, ...config.cloud});
      uploaded.push({...video, url: result.url, seconds: video.seconds || result.seconds});
      log(`uploaded: ${result.url}`);
    } catch (err) {
      log(`upload failed for "${video.spec.hook}" (${err.message})`);
    }
  }
  summary.uploaded = uploaded.length;
  if (!uploaded.length) throw new Error('No video could be uploaded');

  // 4. Schedule in Clip Studio, once per platform.
  for (const platform of config.platforms) {
    try {
      const result = await deps.importToApp({appUrl: config.appUrl, password: config.appPassword, platform, videos: uploaded});
      summary.imports[platform] = `${result.imported ?? '?'} clips scheduled`;
      log(`${platform}: ${summary.imports[platform]}`);
    } catch (err) {
      summary.imports[platform] = `failed: ${err.message}`;
      log(`${platform}: import failed (${err.message})`);
    }
  }

  // 5. Remember the topics so the next run does not repeat them.
  saveHistory(config.historyFile, [...history, ...uploaded.map((v) => ({hook: v.spec.hook, template: v.spec.template, at: new Date().toISOString()}))]);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = ['## Video factory', '', ...uploaded.map((v) => `- ${v.spec.template}: ${v.spec.hook} (${Math.round(v.seconds)}s)`), '', ...Object.entries(summary.imports).map(([p, r]) => `- ${p}: ${r}`)];
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
  if (Object.values(summary.imports).every((r) => String(r).startsWith('failed'))) throw new Error('Clip Studio did not accept the videos on any platform');
  return {...summary, videos: uploaded};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(configFromEnv()).then(
    () => process.exit(0),
    (err) => {
      console.error(`factory failed: ${err.message}`);
      process.exit(1);
    }
  );
}
