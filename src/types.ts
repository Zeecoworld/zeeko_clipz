export type Common = {
  hook: string;
  label: string;
  accent: number;
  music: number;
  brand: string;
  cta: string;
};
export type TipsSpec = Common & {template: 'tips'; items: {heading: string; detail: string}[]};
export type MythSpec = Common & {template: 'myth'; pairs: {myth: string; fact: string}[]};
export type CodeSpec = Common & {template: 'code'; language: string; code: string; steps: {line: number; text: string}[]};
export type VersusSpec = Common & {
  template: 'versus';
  question: string;
  a: {label: string; points: string[]};
  b: {label: string; points: string[]};
};
export type Spec = TipsSpec | MythSpec | CodeSpec | VersusSpec;
export type ShortProps = {spec: Spec};
