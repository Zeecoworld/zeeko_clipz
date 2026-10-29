// How long every scene lasts. Used by the video (to size it) and by the scripts (to validate scripts and report the length).
export const FPS = 30;
export const WIDTH = 720;
export const HEIGHT = 1280;
export const MAX_SECONDS = 56;

const sec = (s) => Math.round(s * FPS);
const words = (text) => String(text || '').trim().split(/\s+/).filter(Boolean).length;

export const INTRO = sec(2.6);
export const OUTRO = sec(2.6);

/** Frames for the code template: first the typing, then one part per explanation step. */
export const codeParts = (spec) => ({
  typing: sec(Math.max(5, String(spec.code || '').length / 20) + 1.5),
  steps: (spec.steps || []).map((step) => sec(Math.max(3.4, words(step.text) / 2.6 + 1.4)))
});

/** Frames of every scene between the intro and the outro. */
export const bodyScenes = (spec) => {
  switch (spec.template) {
    case 'tips':
      return spec.items.map((item) => sec(Math.max(3.6, (words(item.heading) + words(item.detail)) / 2.4 + 1.2)));
    case 'myth':
      return spec.pairs.map((pair) => sec(Math.max(6, (words(pair.myth) + words(pair.fact)) / 2.2 + 3.2)));
    case 'code': {
      const parts = codeParts(spec);
      return [parts.typing + parts.steps.reduce((a, b) => a + b, 0)];
    }
    case 'versus':
      return [sec(5), sec(5), sec(4.2)];
    default:
      return [];
  }
};

export const totalFrames = (spec) => INTRO + bodyScenes(spec).reduce((a, b) => a + b, 0) + OUTRO;
export const totalSeconds = (spec) => totalFrames(spec) / FPS;
