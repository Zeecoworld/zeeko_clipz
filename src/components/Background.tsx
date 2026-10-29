import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import type {Palette} from '../lib/theme';

const Orb: React.FC<{cx: number; cy: number; r: number; color: string; sx: number; sy: number; ph: number; t: number}> = ({cx, cy, r, color, sx, sy, ph, t}) => (
  <div
    style={{
      position: 'absolute',
      left: cx + Math.sin(t * sx + ph) * 90 - r,
      top: cy + Math.cos(t * sy + ph) * 120 - r,
      width: r * 2,
      height: r * 2,
      borderRadius: '50%',
      background: `radial-gradient(circle, ${color}59 0%, ${color}00 70%)`
    }}
  />
);

export const Background: React.FC<{p: Palette}> = ({p}) => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const shift = (frame * 0.5) % 48;
  return (
    <AbsoluteFill style={{background: `linear-gradient(165deg, ${p.bg1} 0%, ${p.bg2} 100%)`}}>
      <Orb cx={120} cy={260} r={340} color={p.a} sx={0.5} sy={0.35} ph={0} t={t} />
      <Orb cx={620} cy={720} r={380} color={p.b} sx={0.4} sy={0.3} ph={2} t={t} />
      <Orb cx={200} cy={1100} r={320} color={p.a} sx={0.3} sy={0.45} ph={4} t={t} />
      <svg width={720} height={1280} style={{position: 'absolute', inset: 0, opacity: 0.07}}>
        <defs>
          <pattern id="grid" width={48} height={48} patternUnits="userSpaceOnUse" patternTransform={`translate(0 ${shift})`}>
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#fff" strokeWidth={1} />
          </pattern>
        </defs>
        <rect width={720} height={1280} fill="url(#grid)" />
      </svg>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)'}} />
    </AbsoluteFill>
  );
};
