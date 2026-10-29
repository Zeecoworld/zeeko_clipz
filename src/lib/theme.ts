import {staticFile} from 'remotion';
import {loadFont} from '@remotion/fonts';

export type Palette = {a: string; b: string; bg1: string; bg2: string};

export const PALETTES: Palette[] = [
  {a: '#22d3ee', b: '#6366f1', bg1: '#060a18', bg2: '#101c3f'},
  {a: '#a78bfa', b: '#ec4899', bg1: '#0a0613', bg2: '#1d1040'},
  {a: '#34d399', b: '#22d3ee', bg1: '#04110e', bg2: '#0a2b2d'},
  {a: '#fb923c', b: '#f43f5e', bg1: '#130806', bg2: '#2b1022'}
];

export const palette = (index: number): Palette => PALETTES[Math.abs(Math.floor(index)) % PALETTES.length];

export const SANS = 'Inter, "Helvetica Neue", Arial, sans-serif';
export const MONO = '"JetBrains Mono", "DejaVu Sans Mono", monospace';

// Fonts ship inside the project (public/fonts), so rendering never depends on the internet.
let loaded = false;
export const loadFonts = () => {
  if (loaded) return;
  loaded = true;
  const inter = (weight: string) => loadFont({family: 'Inter', url: staticFile(`fonts/inter-latin-${weight}-normal.woff2`), weight});
  inter('700');
  inter('800');
  inter('900');
  loadFont({family: 'JetBrains Mono', url: staticFile('fonts/jetbrains-mono-latin-400-normal.woff2'), weight: '400'});
  loadFont({family: 'JetBrains Mono', url: staticFile('fonts/jetbrains-mono-latin-700-normal.woff2'), weight: '700'});
};

// The parts of the screen that TikTok and YouTube Shorts cover with their buttons and captions stay empty.
export const SAFE = {left: 56, right: 56, top: 150, bottom: 280};
export const CONTENT_WIDTH = 720 - SAFE.left - SAFE.right;
