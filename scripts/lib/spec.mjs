import {MAX_SECONDS, totalSeconds} from '../../src/timing.mjs';

export const TEMPLATES = ['tips', 'myth', 'code', 'versus'];
export const LANGUAGES = ['javascript', 'typescript', 'python', 'bash', 'sql'];
export const CODE_MAX_LINES = 11;
export const CODE_MAX_WIDTH = 36;

// Plain text only: no emoji, no control characters, no doubled spaces.
export const clean = (value, max) =>
  String(value ?? '')
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();

const need = (condition, message) => {
  if (!condition) throw new Error(message);
};

const list = (value, min, max, what) => {
  need(Array.isArray(value), `${what} must be a list`);
  need(value.length >= min, `${what} needs at least ${min} entries`);
  return value.slice(0, max);
};

const hashtags = (raw) =>
  (Array.isArray(raw) ? raw : [])
    .map((tag) => String(tag).replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((tag) => tag && tag.length <= 30 && tag.toLowerCase() !== 'shorts')
    .filter((tag, i, all) => all.findIndex((other) => other.toLowerCase() === tag.toLowerCase()) === i)
    .slice(0, 5)
    .map((tag) => `#${tag}`);

const cleanCode = (code) => {
  const lines = String(code ?? '')
    .replace(/\r/g, '')
    .replace(/\t/g, '  ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\s+$/, '')
    .split('\n');
  need(lines.length >= 2 && lines.length <= CODE_MAX_LINES, `the code must have 2 to ${CODE_MAX_LINES} lines`);
  need(lines.every((line) => line.length <= CODE_MAX_WIDTH), `every code line must be at most ${CODE_MAX_WIDTH} characters`);
  return lines.map((line) => line.replace(/\s+$/, '')).join('\n');
};

/**
 * Checks and tidies one video script written by the AI.
 * Returns { spec, meta } where spec drives the video and meta is the title, description and hashtags for posting.
 * Throws an Error that says what is wrong when the script cannot be used.
 */
export const cleanVideo = (raw, defaults = {}) => {
  need(raw && typeof raw === 'object', 'the script is not an object');
  const template = String(raw.template || '').toLowerCase();
  need(TEMPLATES.includes(template), `unknown template "${raw.template}"`);

  const base = {
    template,
    accent: Number.isInteger(defaults.accent) ? defaults.accent : 0,
    music: Number.isInteger(defaults.music) ? defaults.music : 0,
    brand: clean(defaults.brand || 'Zeecomedia Tech', 30),
    cta: clean(defaults.cta || 'Follow for daily coding tips', 48),
    label: clean(raw.label, 22) || {tips: 'Coding tip', myth: 'Myth vs fact', code: 'Code tip', versus: 'Which one?'}[template],
    hook: clean(raw.hook, 70)
  };
  need(base.hook.length >= 8, 'the hook is missing or too short');

  let spec;
  if (template === 'tips') {
    const items = list(raw.items, 3, 5, 'items').map((item) => ({heading: clean(item && item.heading, 48), detail: clean(item && item.detail, 110)}));
    need(items.every((item) => item.heading && item.detail), 'every tip needs a heading and a detail');
    spec = {...base, items};
  } else if (template === 'myth') {
    const pairs = list(raw.pairs, 2, 3, 'pairs').map((pair) => ({myth: clean(pair && pair.myth, 80), fact: clean(pair && pair.fact, 130)}));
    need(pairs.every((pair) => pair.myth && pair.fact), 'every pair needs a myth and a fact');
    spec = {...base, pairs};
  } else if (template === 'code') {
    const language = String(raw.language || '').toLowerCase();
    need(LANGUAGES.includes(language), `the language must be one of ${LANGUAGES.join(', ')}`);
    const code = cleanCode(raw.code);
    const lineCount = code.split('\n').length;
    const steps = list(raw.steps, 2, 3, 'steps').map((step) => ({line: Number(step && step.line), text: clean(step && step.text, 90)}));
    need(steps.every((step) => Number.isInteger(step.line) && step.line >= 1 && step.line <= lineCount && step.text), 'every step needs a real line number and some text');
    spec = {...base, language, code, steps};
  } else {
    const side = (value, name) => {
      need(value && typeof value === 'object', `${name} is missing`);
      const label = clean(value.label, 26);
      const points = list(value.points, 2, 3, `${name} points`).map((point) => clean(point, 40));
      need(label && points.every(Boolean), `${name} needs a label and points`);
      return {label, points};
    };
    const question = clean(raw.question, 60);
    need(question.length >= 6, 'the question is missing');
    spec = {...base, question, a: side(raw.a, 'option a'), b: side(raw.b, 'option b')};
  }

  // Keep the video inside the length limit by dropping the last entries.
  const shrink = (key, min) => {
    while (totalSeconds(spec) > MAX_SECONDS && spec[key].length > min) spec[key] = spec[key].slice(0, -1);
  };
  if (template === 'tips') shrink('items', 3);
  if (template === 'myth') shrink('pairs', 2);
  need(totalSeconds(spec) <= MAX_SECONDS, `the video would be longer than ${MAX_SECONDS} seconds`);

  const meta = {
    title: clean(raw.title, 90),
    description: clean(raw.description, 300),
    hashtags: hashtags(raw.hashtags)
  };
  need(meta.title.length >= 8, 'the title is missing or too short');
  need(meta.description.length >= 20, 'the description is missing or too short');
  need(meta.hashtags.length >= 2, 'at least 2 hashtags are needed');

  return {spec, meta};
};

export const normalizeHook = (text) => String(text).toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
