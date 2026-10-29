import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import {Frame} from '../components/Frame';
import {Card, Hook, Outro} from '../components/Scenes';
import {easeOut, progress, useScene, useSpring} from '../lib/anim';
import {SAFE, palette, type Palette} from '../lib/theme';
import {INTRO, OUTRO, bodyScenes} from '../timing.mjs';
import type {TipsSpec} from '../types';
import {useCurrentFrame} from 'remotion';

const TipScene: React.FC<{item: TipsSpec['items'][number]; index: number; total: number; length: number; p: Palette}> = ({item, index, total, length, p}) => {
  const frame = useCurrentFrame();
  const scene = useScene(length);
  const badge = useSpring(4, 9, 160);
  const detail = easeOut(progress(frame, 16, 34));
  const headingSize = item.heading.length > 40 ? 46 : 56;
  return (
    <AbsoluteFill style={{opacity: scene.opacity, transform: `translateY(${scene.y}px)`, justifyContent: 'center', padding: `${SAFE.top}px ${SAFE.right}px ${SAFE.bottom}px ${SAFE.left}px`}}>
      <div style={{display: 'flex', gap: 12, marginBottom: 34}}>
        {Array.from({length: total}).map((_, i) => (
          <div key={i} style={{height: 10, flex: 1, borderRadius: 5, background: i <= index ? `linear-gradient(90deg, ${p.a}, ${p.b})` : 'rgba(255,255,255,0.18)'}} />
        ))}
      </div>
      <Card p={p}>
        <div
          style={{
            width: 104,
            height: 104,
            borderRadius: 30,
            background: `linear-gradient(135deg, ${p.a}, ${p.b})`,
            color: '#06121f',
            fontSize: 58,
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `scale(${0.3 + badge * 0.7}) rotate(${(1 - badge) * -20}deg)`,
            marginBottom: 30
          }}
        >
          {index + 1}
        </div>
        <div style={{fontSize: headingSize, fontWeight: 900, lineHeight: 1.12, letterSpacing: -0.5}}>{item.heading}</div>
        <div style={{fontSize: 34, fontWeight: 700, lineHeight: 1.35, color: '#cbd5e1', marginTop: 24, opacity: detail, transform: `translateY(${(1 - detail) * 24}px)`}}>
          {item.detail}
        </div>
      </Card>
    </AbsoluteFill>
  );
};

export const Tips: React.FC<{spec: TipsSpec}> = ({spec}) => {
  const p = palette(spec.accent);
  const scenes = bodyScenes(spec);
  let at = INTRO;
  return (
    <Frame accent={spec.accent} music={spec.music} brand={spec.brand}>
      <Sequence from={0} durationInFrames={INTRO}>
        <Hook label={spec.label} text={spec.hook} p={p} length={INTRO} />
      </Sequence>
      {spec.items.map((item, i) => {
        const from = at;
        at += scenes[i];
        return (
          <Sequence key={i} from={from} durationInFrames={scenes[i]}>
            <TipScene item={item} index={i} total={spec.items.length} length={scenes[i]} p={p} />
          </Sequence>
        );
      })}
      <Sequence from={at} durationInFrames={OUTRO}>
        <Outro cta={spec.cta} brand={spec.brand} p={p} length={OUTRO} />
      </Sequence>
    </Frame>
  );
};
