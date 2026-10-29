import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {progress, easeOut, useScene, useSpring} from '../lib/anim';
import {SAFE, SANS, type Palette} from '../lib/theme';

const fitSize = (text: string, big: number, mid: number, small: number) => (text.length > 62 ? small : text.length > 38 ? mid : big);

export const Chip: React.FC<{text: string; p: Palette}> = ({text, p}) => (
  <div
    style={{
      alignSelf: 'flex-start',
      padding: '10px 22px',
      borderRadius: 999,
      background: `${p.a}2e`,
      border: `2px solid ${p.a}`,
      color: p.a,
      fontSize: 24,
      fontWeight: 800,
      letterSpacing: 3,
      textTransform: 'uppercase'
    }}
  >
    {text}
  </div>
);

// First scene: the hook, one word at a time.
export const Hook: React.FC<{label: string; text: string; p: Palette; length: number}> = ({label, text, p, length}) => {
  const frame = useCurrentFrame();
  const scene = useScene(length, 10);
  const size = fitSize(text, 78, 66, 54);
  const words = text.split(/\s+/).filter(Boolean);
  const chip = useSpring(0);
  const line = easeOut(progress(frame, words.length * 4 + 6, words.length * 4 + 22));
  return (
    <AbsoluteFill style={{opacity: scene.opacity, justifyContent: 'center', padding: `${SAFE.top}px ${SAFE.right}px ${SAFE.bottom}px ${SAFE.left}px`}}>
      <div style={{display: 'flex', flexDirection: 'column', gap: 36}}>
        <div style={{transform: `scale(${0.6 + chip * 0.4})`, opacity: chip, transformOrigin: 'left center'}}>
          <Chip text={label} p={p} />
        </div>
        <div style={{display: 'flex', flexWrap: 'wrap', gap: `0 ${size * 0.28}px`, fontSize: size, fontWeight: 900, lineHeight: 1.12, letterSpacing: -1}}>
          {words.map((word, i) => {
            const s = Math.min(1, Math.max(0, (frame - 8 - i * 4) / 10));
            const e = easeOut(s);
            return (
              <span key={i} style={{display: 'inline-block', opacity: e, transform: `translateY(${(1 - e) * 36}px) scale(${0.9 + 0.1 * e})`}}>
                {word}
              </span>
            );
          })}
        </div>
        <div style={{height: 8, width: `${line * 62}%`, borderRadius: 4, background: `linear-gradient(90deg, ${p.a}, ${p.b})`}} />
      </div>
    </AbsoluteFill>
  );
};

// Last scene: follow prompt with a bouncing arrow.
export const Outro: React.FC<{cta: string; brand: string; p: Palette; length: number}> = ({cta, brand, p, length}) => {
  const frame = useCurrentFrame();
  const scene = useScene(length, 12);
  const pop = useSpring(2, 11, 150);
  const bounce = Math.sin(frame / 5) * 12;
  const size = cta.length > 36 ? 52 : 62;
  return (
    <AbsoluteFill style={{opacity: scene.opacity, alignItems: 'center', justifyContent: 'center', paddingBottom: SAFE.bottom - 40}}>
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34, textAlign: 'center', padding: '0 70px'}}>
        <div
          style={{
            width: 150,
            height: 150,
            borderRadius: 40,
            background: `linear-gradient(135deg, ${p.a}, ${p.b})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 64,
            fontWeight: 900,
            fontFamily: '"JetBrains Mono", monospace',
            color: '#06121f',
            transform: `scale(${0.4 + pop * 0.6})`,
            boxShadow: `0 20px 80px ${p.a}66`
          }}
        >
          {'</>'}
        </div>
        <div style={{fontSize: size, fontWeight: 900, lineHeight: 1.15, fontFamily: SANS}}>{cta}</div>
        <div style={{fontSize: 34, fontWeight: 700, color: p.a}}>{brand}</div>
        <div style={{fontSize: 56, transform: `translateY(${bounce}px)`, color: p.a, opacity: interpolate(frame, [10, 24], [0, 1], {extrapolateRight: 'clamp'})}}>{'\u2193'}</div>
      </div>
    </AbsoluteFill>
  );
};

// A glass card that slides in, used by the body scenes.
export const Card: React.FC<{p: Palette; delay?: number; children: React.ReactNode; tint?: string; style?: React.CSSProperties}> = ({p, delay = 0, children, tint, style}) => {
  const s = useSpring(delay, 15, 110);
  return (
    <div
      style={{
        opacity: Math.min(1, s * 1.5),
        transform: `translateX(${(1 - s) * 90}px)`,
        borderRadius: 36,
        padding: 40,
        background: tint ? `${tint}22` : 'rgba(255,255,255,0.07)',
        border: `2px solid ${tint ? `${tint}88` : 'rgba(255,255,255,0.16)'}`,
        boxShadow: `0 24px 70px rgba(0,0,0,0.35), inset 0 0 0 1px ${p.a}10`,
        backdropFilter: 'blur(6px)',
        ...style
      }}
    >
      {children}
    </div>
  );
};
