import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {Frame} from '../components/Frame';
import {Card, Hook, Outro} from '../components/Scenes';
import {easeOut, progress, useScene, useSpring} from '../lib/anim';
import {SAFE, palette, type Palette} from '../lib/theme';
import {INTRO, OUTRO, bodyScenes} from '../timing.mjs';
import type {MythSpec} from '../types';

const RED = '#f87171';
const GREEN = '#4ade80';

const Label: React.FC<{text: string; color: string}> = ({text, color}) => (
  <div style={{fontSize: 24, fontWeight: 900, letterSpacing: 4, color, marginBottom: 16}}>{text}</div>
);

const Check: React.FC<{frame: number}> = ({frame}) => {
  const draw = easeOut(progress(frame, 0, 16));
  return (
    <svg width={56} height={56} viewBox="0 0 56 56" style={{flex: 'none'}}>
      <circle cx={28} cy={28} r={26} fill={`${GREEN}30`} stroke={GREEN} strokeWidth={3} />
      <path d="M15 29 L25 38 L42 19" fill="none" stroke={GREEN} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={50} strokeDashoffset={50 * (1 - draw)} />
    </svg>
  );
};

const MythScene: React.FC<{pair: MythSpec['pairs'][number]; length: number; p: Palette}> = ({pair, length, p}) => {
  const frame = useCurrentFrame();
  const scene = useScene(length);
  const factAt = Math.round(length * 0.46);
  const struck = frame > factAt - 14;
  const dim = 1 - 0.45 * easeOut(progress(frame, factAt - 14, factAt));
  const size = (text: string) => (text.length > 70 ? 36 : text.length > 45 ? 42 : 48);
  return (
    <AbsoluteFill style={{opacity: scene.opacity, transform: `translateY(${scene.y}px)`, justifyContent: 'center', padding: `${SAFE.top}px ${SAFE.right}px ${SAFE.bottom}px ${SAFE.left}px`}}>
      <div style={{display: 'flex', flexDirection: 'column', gap: 30}}>
        <Card p={p} tint={RED} style={{opacity: dim}}>
          <Label text="MYTH" color={RED} />
          <div
            style={{
              fontSize: size(pair.myth),
              fontWeight: 800,
              lineHeight: 1.2,
              textDecoration: struck ? 'line-through' : 'none',
              textDecorationColor: RED,
              textDecorationThickness: 5
            }}
          >
            {pair.myth}
          </div>
        </Card>
        <FactCard pair={pair} at={factAt} p={p} size={size(pair.fact)} />
      </div>
    </AbsoluteFill>
  );
};

const FactCard: React.FC<{pair: MythSpec['pairs'][number]; at: number; p: Palette; size: number}> = ({pair, at, p, size}) => {
  const frame = useCurrentFrame();
  const s = useSpring(at, 14, 120);
  return (
    <div style={{opacity: Math.min(1, s * 1.6), transform: `translateY(${(1 - s) * 70}px) scale(${0.94 + 0.06 * s})`}}>
      <Card p={p} tint={GREEN}>
        <div style={{display: 'flex', alignItems: 'center', gap: 18, marginBottom: 16}}>
          <Check frame={frame - at - 6} />
          <div style={{fontSize: 24, fontWeight: 900, letterSpacing: 4, color: GREEN}}>FACT</div>
        </div>
        <div style={{fontSize: size, fontWeight: 800, lineHeight: 1.25}}>{pair.fact}</div>
      </Card>
    </div>
  );
};

export const Myth: React.FC<{spec: MythSpec}> = ({spec}) => {
  const p = palette(spec.accent);
  const scenes = bodyScenes(spec);
  let at = INTRO;
  return (
    <Frame accent={spec.accent} music={spec.music} brand={spec.brand}>
      <Sequence from={0} durationInFrames={INTRO}>
        <Hook label={spec.label} text={spec.hook} p={p} length={INTRO} />
      </Sequence>
      {spec.pairs.map((pair, i) => {
        const from = at;
        at += scenes[i];
        return (
          <Sequence key={i} from={from} durationInFrames={scenes[i]}>
            <MythScene pair={pair} length={scenes[i]} p={p} />
          </Sequence>
        );
      })}
      <Sequence from={at} durationInFrames={OUTRO}>
        <Outro cta={spec.cta} brand={spec.brand} p={p} length={OUTRO} />
      </Sequence>
    </Frame>
  );
};
