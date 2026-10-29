import React from 'react';
import {AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Background} from './Background';
import {SANS, palette} from '../lib/theme';

// Background, brand tag, progress bar and music that every video shares.
export const Frame: React.FC<{accent: number; music: number; brand: string; children: React.ReactNode}> = ({accent, music, brand, children}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const p = palette(accent);
  const volume = interpolate(frame, [0, 30, durationInFrames - 50, durationInFrames], [0, 0.5, 0.5, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{fontFamily: SANS, color: '#fff'}}>
      <Background p={p} />
      <Audio src={staticFile(`music/track${Math.abs(Math.floor(music)) % 3}.wav`)} volume={volume} />
      <div style={{position: 'absolute', left: 0, top: 0, height: 6, width: `${(frame / durationInFrames) * 100}%`, background: `linear-gradient(90deg, ${p.a}, ${p.b})`}} />
      <div
        style={{
          position: 'absolute',
          top: 64,
          left: 56,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: 0.5,
          color: 'rgba(255,255,255,0.85)'
        }}
      >
        <div style={{width: 14, height: 14, borderRadius: 4, background: `linear-gradient(135deg, ${p.a}, ${p.b})`}} />
        {brand}
      </div>
      {children}
    </AbsoluteFill>
  );
};
