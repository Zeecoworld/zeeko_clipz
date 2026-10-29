import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {Frame} from '../components/Frame';
import {Chip, Hook, Outro} from '../components/Scenes';
import {progress, useScene, useSpring} from '../lib/anim';
import {EXTENSIONS, tokenize} from '../lib/highlight';
import {MONO, SAFE, palette, type Palette} from '../lib/theme';
import {INTRO, OUTRO, bodyScenes, codeParts} from '../timing.mjs';
import type {CodeSpec} from '../types';

const LINE_HEIGHT = 38;

const Editor: React.FC<{spec: CodeSpec; p: Palette; shown: number; activeLine: number | null; caret: boolean}> = ({spec, p, shown, activeLine, caret}) => {
  const lines = spec.code.split('\n');
  let offset = 0;
  const ext = EXTENSIONS[spec.language] || 'txt';
  return (
    <div style={{borderRadius: 28, overflow: 'hidden', background: '#0d1117', border: `2px solid ${p.a}55`, boxShadow: `0 30px 90px rgba(0,0,0,0.55), 0 0 60px ${p.a}22`}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '16px 22px', background: '#161b22'}}>
        {['#ff5f56', '#ffbd2e', '#27c93f'].map((c) => (
          <div key={c} style={{width: 15, height: 15, borderRadius: '50%', background: c}} />
        ))}
        <div style={{marginLeft: 14, fontFamily: MONO, fontSize: 20, color: '#8b98a9'}}>snippet.{ext}</div>
      </div>
      <div style={{padding: '22px 0 22px 0', fontFamily: MONO, fontSize: 24}}>
        {lines.map((line, i) => {
          const visible = Math.max(0, Math.min(line.length, shown - offset));
          const lineStart = offset;
          offset += line.length + 1;
          const active = activeLine === i + 1;
          let left = visible;
          const tokens = tokenize(line)
            .map((t) => {
              const take = Math.max(0, Math.min(t.text.length, left));
              left -= take;
              return {...t, text: t.text.slice(0, take)};
            })
            .filter((t) => t.text.length);
          const showCaret = caret && shown >= lineStart && shown <= lineStart + line.length;
          return (
            <div key={i} style={{display: 'flex', height: LINE_HEIGHT, alignItems: 'center', background: active ? `${p.a}26` : 'transparent', borderLeft: active ? `5px solid ${p.a}` : '5px solid transparent'}}>
              <div style={{width: 46, textAlign: 'right', paddingRight: 18, color: active ? p.a : '#4b5565'}}>{i + 1}</div>
              <div style={{whiteSpace: 'pre'}}>
                {tokens.map((t, k) => (
                  <span key={k} style={{color: t.color}}>
                    {t.text}
                  </span>
                ))}
                {showCaret ? <span style={{display: 'inline-block', width: 12, height: 28, background: p.a, marginLeft: 1, verticalAlign: 'middle'}} /> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const CodeScene: React.FC<{spec: CodeSpec; length: number; p: Palette}> = ({spec, length, p}) => {
  const frame = useCurrentFrame();
  const scene = useScene(length);
  const parts = codeParts(spec);
  const typingEnd = parts.typing;
  const total = spec.code.length;
  const typed = Math.floor(progress(frame, 10, typingEnd - 18) * total);
  const shown = frame >= typingEnd - 18 ? total : typed;

  let stepIndex = -1;
  let cursor = typingEnd;
  let stepStart = typingEnd;
  parts.steps.forEach((len, i) => {
    if (frame >= cursor) {
      stepIndex = i;
      stepStart = cursor;
    }
    cursor += len;
  });
  const step = stepIndex >= 0 ? spec.steps[stepIndex] : null;
  const pop = useSpring(stepStart, 15, 130);
  const caret = frame < typingEnd && Math.floor(frame / 12) % 2 === 0;

  return (
    <AbsoluteFill style={{opacity: scene.opacity, transform: `translateY(${scene.y}px)`, justifyContent: 'center', padding: `${SAFE.top}px ${SAFE.right}px ${SAFE.bottom}px ${SAFE.left}px`}}>
      <Editor spec={spec} p={p} shown={shown} activeLine={step ? step.line : null} caret={caret} />
      {step ? (
        <div
          style={{
            marginTop: 30,
            opacity: Math.min(1, pop * 1.5),
            transform: `translateY(${(1 - pop) * 40}px)`,
            borderRadius: 30,
            padding: '30px 34px',
            background: 'rgba(255,255,255,0.08)',
            border: '2px solid rgba(255,255,255,0.18)'
          }}
        >
          <div style={{display: 'flex', marginBottom: 16}}>
            <Chip text={`Step ${stepIndex + 1}`} p={p} />
          </div>
          <div style={{fontSize: step.text.length > 70 ? 32 : 38, fontWeight: 800, lineHeight: 1.28}}>{step.text}</div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const Code: React.FC<{spec: CodeSpec}> = ({spec}) => {
  const p = palette(spec.accent);
  const [bodyLength] = bodyScenes(spec);
  return (
    <Frame accent={spec.accent} music={spec.music} brand={spec.brand}>
      <Sequence from={0} durationInFrames={INTRO}>
        <Hook label={spec.label} text={spec.hook} p={p} length={INTRO} />
      </Sequence>
      <Sequence from={INTRO} durationInFrames={bodyLength}>
        <CodeScene spec={spec} length={bodyLength} p={p} />
      </Sequence>
      <Sequence from={INTRO + bodyLength} durationInFrames={OUTRO}>
        <Outro cta={spec.cta} brand={spec.brand} p={p} length={OUTRO} />
      </Sequence>
    </Frame>
  );
};
