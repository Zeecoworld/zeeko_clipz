import type {CodeSpec, Spec} from './types';

export const FPS: number;
export const WIDTH: number;
export const HEIGHT: number;
export const MAX_SECONDS: number;
export const INTRO: number;
export const OUTRO: number;
export function codeParts(spec: CodeSpec): {typing: number; steps: number[]};
export function bodyScenes(spec: Spec): number[];
export function totalFrames(spec: Spec): number;
export function totalSeconds(spec: Spec): number;
