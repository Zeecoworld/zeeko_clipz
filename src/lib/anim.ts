import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

/** 0 to 1 with a springy overshoot, starting after `delay` frames. */
export const useSpring = (delay = 0, damping = 13, stiffness = 130) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return spring({frame: frame - delay, fps, config: {damping, stiffness, mass: 0.8}});
};

/** Fade-and-rise entrance plus a fade-out in the last frames of a scene. */
export const useScene = (length: number, fadeOut = 9) => {
  const frame = useCurrentFrame();
  const enter = useSpring(0, 16, 120);
  const out = interpolate(frame, [length - fadeOut, length], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return {opacity: Math.min(1, enter * 1.4) * out, y: (1 - enter) * 60, out};
};

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export const progress = (frame: number, from: number, to: number) => clamp01((frame - from) / Math.max(1, to - from));
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
