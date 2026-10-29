import path from 'node:path';
import fs from 'node:fs';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');

// Remotion normally downloads its own Chrome. BROWSER can point at a Chrome you already have (used for local tests).
const browserExecutable = process.env.BROWSER || null;
const chromiumOptions = process.env.BROWSER ? {gl: 'swangle'} : {};

let serveUrl = null;
export const prepare = async (log = console.log) => {
  if (serveUrl) return serveUrl;
  log('render: bundling the video project');
  serveUrl = await bundle({entryPoint: path.join(root, 'src', 'index.ts'), publicDir: path.join(root, 'public')});
  return serveUrl;
};

export const renderVideo = async ({spec, output, log = console.log}) => {
  const url = await prepare(log);
  fs.mkdirSync(path.dirname(output), {recursive: true});
  const composition = await selectComposition({serveUrl: url, id: 'Short', inputProps: {spec}, browserExecutable, chromiumOptions});
  let lastPercent = -1;
  await renderMedia({
    composition,
    serveUrl: url,
    codec: 'h264',
    outputLocation: output,
    inputProps: {spec},
    crf: 22,
    x264Preset: 'veryfast',
    pixelFormat: 'yuv420p',
    audioBitrate: '128k',
    browserExecutable,
    chromiumOptions,
    onProgress: ({progress}) => {
      const percent = Math.floor(progress * 10) * 10;
      if (percent !== lastPercent) {
        lastPercent = percent;
        log(`render: ${percent}%`);
      }
    }
  });
  return {seconds: composition.durationInFrames / composition.fps, file: output};
};
