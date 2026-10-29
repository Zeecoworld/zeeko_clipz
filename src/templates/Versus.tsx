import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {Frame} from '../components/Frame';
import {Chip, Hook, Outro} from '../components/Scenes';
import {easeOut, progress, useScene, useSpring} from '../lib/anim';
import {SAFE, palette, type Palette} from '../lib/theme';
import {INTRO, OUTRO, bodyScenes} from '../timing.mjs';
import type {VersusSpec} from '../types';

type Side = VersusSpec['a'];

const Option: React.FC<{letter: string; side: Side; p: Palette; active: boolean; enter: number; start: number; color: string}> = ({letter, side, p, active, enter, start, color}) => {
  const frame = useCurrentFrame();
  const s = useSpring(enter, 14, 120);
  return (
    <div
      style={{
        borderRadius: 34,
        padding: '30px 34px',
        background: active ? `${color}26` : 'rgba(255,255,255,0.05)',
        border: `2px solid ${active ? color : 'rgba(255,255,255,0.14)'}`,
        opacity: active ? 1 : 0.55,
        transform: `scale(${active ? 1 : 0.97}) translateX(${(1 - s) * 80}px)`,
        boxShadow: active ? `0 0 70px ${color}33` : 'none'
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', gap: 22}}>
        <div style={{width: 74, height: 74, borderRadius: 22, flex: 'none', background: color, color: '#06121f', fontSize: 44, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{letter}</div>
        <div style={{fontSize: side.label.length > 22 ? 36 : 44, fontWeight: 900, lineHeight: 1.1}}>{side.label}</div>
      </div>
      <div style={{marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10}}>
        {side.points.map((point, i) => {
          const e = easeOut(progress(frame, start + 12 + i * 14, start + 26 + i * 14));
          return (
            <div key={i} style={{display: 'flex', gap: 14, fontSize: 30, fontWeight: 700, lineHeight: 1.25, color: '#dbe4f0', opacity: e, transform: `translateY(${(1 - e) * 14}px)`}}>
              <span style={{color}}>{'\u25B8'}</span>
              <span>{point}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const VersusScene: React.FC<{spec: VersusSpec; length: number; p: Palette; phases: number[]}> = ({spec, length, p, phases}) => {
  const frame = useCurrentFrame();
  const scene = useScene(length);
  const bAt = phases[0];
  const qAt = phases[0] + phases[1];
  const q = useSpring(qAt, 12, 140);
  const inQuestion = frame >= qAt;
  const colorA = p.a;
  const colorB = '#f472b6';
  return (
    <AbsoluteFill style={{opacity: scene.opacity, transform: `translateY(${scene.y}px)`, justifyContent: 'center', padding: `${SAFE.top}px ${SAFE.right}px ${SAFE.bottom}px ${SAFE.left}px`}}>
      <div style={{display: 'flex', flexDirection: 'column', gap: 18, opacity: 1 - easeOut(progress(frame, qAt, qAt + 10))}}>
        <Option letter="A" side={spec.a} p={p} active={frame < bAt} enter={0} start={0} color={colorA} />
        <div style={{alignSelf: 'center', fontSize: 30, fontWeight: 900, letterSpacing: 6, color: 'rgba(255,255,255,0.7)'}}>VS</div>
        <Option letter="B" side={spec.b} p={p} active={frame >= bAt} enter={10} start={bAt} color={colorB} />
      </div>
      {inQuestion ? (
        <AbsoluteFill style={{justifyContent: 'center', padding: `0 ${SAFE.right}px ${SAFE.bottom - 60}px ${SAFE.left}px`}}>
          <div style={{opacity: Math.min(1, q * 1.5), transform: `scale(${0.85 + q * 0.15})`, display: 'flex', flexDirection: 'column', gap: 34}}>
            <div style={{fontSize: spec.question.length > 50 ? 56 : 68, fontWeight: 900, lineHeight: 1.12, letterSpacing: -1}}>{spec.question}</div>
            <div style={{display: 'flex', gap: 18, alignItems: 'center'}}>
              <Chip text="Comment A or B" p={p} />
            </div>
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

export const Versus: React.FC<{spec: VersusSpec}> = ({spec}) => {
  const p = palette(spec.accent);
  const phases = bodyScenes(spec);
  const body = phases.reduce((a, b) => a + b, 0);
  return (
    <Frame accent={spec.accent} music={spec.music} brand={spec.brand}>
      <Sequence from={0} durationInFrames={INTRO}>
        <Hook label={spec.label} text={spec.hook} p={p} length={INTRO} />
      </Sequence>
      <Sequence from={INTRO} durationInFrames={body}>
        <VersusScene spec={spec} length={body} p={p} phases={phases} />
      </Sequence>
      <Sequence from={INTRO + body} durationInFrames={OUTRO}>
        <Outro cta={spec.cta} brand={spec.brand} p={p} length={OUTRO} />
      </Sequence>
    </Frame>
  );
};
