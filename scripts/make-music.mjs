// Writes three original, royalty-free background tracks (public/music/track0..2.wav).
// They are generated from scratch with simple synthesis, so there are no copyright or licence issues.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const SR = 32000;
const SECONDS = 66;
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'music');

const presets = [
  {bpm: 104, chords: [[57, 60, 64], [53, 57, 60], [48, 55, 60], [55, 59, 62]]},
  {bpm: 112, chords: [[50, 53, 57], [46, 53, 58], [53, 57, 60], [48, 55, 60]]},
  {bpm: 98, chords: [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]]}
];

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rng = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const render = (preset, seed) => {
  const random = rng(seed);
  const total = SR * SECONDS;
  const data = new Float32Array(total);
  const beat = (60 / preset.bpm) * SR;
  const chordLen = beat * 4;
  let hatState = 0;

  for (let i = 0; i < total; i += 1) {
    const t = i / SR;
    const chordIndex = Math.floor(i / chordLen) % preset.chords.length;
    const chord = preset.chords[chordIndex];
    const inChord = (i % chordLen) / SR;
    const beatPos = (i % beat) / SR;
    const beatNum = Math.floor(i / beat);
    let s = 0;

    // soft pad: each chord note with a slow attack and release
    const pad = Math.min(1, inChord / 0.5) * Math.min(1, (chordLen / SR - inChord) / 0.5);
    for (const note of chord) {
      const f = mtof(note);
      s += (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2 * t + 0.4)) * 0.045 * pad;
    }

    // bass: one octave under the chord root, pulsing on every beat
    s += Math.sin(2 * Math.PI * mtof(chord[0] - 12) * t) * 0.22 * Math.exp(-beatPos * 3.2) * 0.9;

    // plucked arpeggio on eighth notes
    const eighth = beat / 2;
    const step = Math.floor(i / eighth);
    const stepPos = (i % eighth) / SR;
    const arpNote = chord[step % chord.length] + 12 + (step % 8 >= 4 ? 12 : 0);
    const af = mtof(arpNote);
    s += (Math.sin(2 * Math.PI * af * t) + 0.25 * Math.sin(2 * Math.PI * af * 3 * t)) * 0.07 * Math.exp(-stepPos * 9);

    // soft kick on every beat
    const kf = 45 + 75 * Math.exp(-beatPos * 30);
    s += Math.sin(2 * Math.PI * kf * beatPos) * 0.3 * Math.exp(-beatPos * 14);

    // quiet hi-hat on the off-beats (noise with the low end removed)
    const offPos = ((i + beat / 2) % beat) / SR;
    const noise = random() * 2 - 1;
    const hp = noise - hatState;
    hatState = noise * 0.6;
    s += hp * 0.05 * Math.exp(-offPos * 45) * (beatNum % 2 === 0 ? 1 : 0.8);

    data[i] = Math.tanh(s * 1.4);
  }

  // fade the ends so that loops and cuts never click
  const fade = SR * 1.5;
  for (let i = 0; i < fade; i += 1) {
    data[i] *= i / fade;
    data[total - 1 - i] *= i / fade;
  }
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const gain = 0.8 / (peak || 1);

  const wav = Buffer.alloc(44 + total * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + total * 2, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SR, 24);
  wav.writeUInt32LE(SR * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(total * 2, 40);
  for (let i = 0; i < total; i += 1) wav.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(data[i] * gain * 32767))), 44 + i * 2);
  return wav;
};

fs.mkdirSync(out, {recursive: true});
presets.forEach((preset, index) => {
  const file = path.join(out, `track${index}.wav`);
  fs.writeFileSync(file, render(preset, 1000 + index));
  console.log(`wrote ${file}`);
});
