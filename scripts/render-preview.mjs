// Developer helper: renders a few still frames of every sample so the look can be checked without a full render.
// Usage: BROWSER=/path/to/chrome node scripts/render-preview.mjs [template]
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {SAMPLES} from './samples.mjs';
import {FPS, INTRO, bodyScenes, totalFrames} from '../src/timing.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'out', 'preview');
fs.mkdirSync(outDir, {recursive: true});
const only = process.argv[2];
const browserExecutable = process.env.BROWSER || null;
const chromiumOptions = process.env.BROWSER ? {gl: 'swangle'} : {};

const serveUrl = await bundle({entryPoint: path.join(root, 'src', 'index.ts'), publicDir: path.join(root, 'public')});
for (const [name, spec] of Object.entries(SAMPLES)) {
  if (only && only !== name) continue;
  const composition = await selectComposition({serveUrl, id: 'Short', inputProps: {spec}, browserExecutable, chromiumOptions});
  const scenes = bodyScenes(spec);
  const frames = process.env.FRAMES
    ? process.env.FRAMES.split(',').map(Number)
    : [Math.round(INTRO * 0.7), INTRO + Math.round(scenes[0] * 0.35), INTRO + Math.round(scenes[0] * 0.85), totalFrames(spec) - 20];
  console.log(name, 'duration', (composition.durationInFrames / FPS).toFixed(1) + 's', 'frames', frames.join(','));
  for (const frame of frames) {
    const output = path.join(outDir, `${name}-${String(frame).padStart(4, '0')}.png`);
    await renderStill({composition, serveUrl, output, frame: Math.min(frame, composition.durationInFrames - 1), inputProps: {spec}, browserExecutable, chromiumOptions});
  }
}
console.log('previews in', outDir);
