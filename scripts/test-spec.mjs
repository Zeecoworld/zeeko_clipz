// Checks for the script validator and the payload sent to Clip Studio. Run with: npm test
import assert from 'node:assert/strict';
import {SAMPLES} from './samples.mjs';
import {cleanVideo, normalizeHook} from './lib/spec.mjs';
import {FPS, totalSeconds} from '../src/timing.mjs';

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (err) {
    console.log(`FAIL ${name}\n     ${err.message}`);
    process.exitCode = 1;
  }
};
const meta = {title: 'A clear title about coding', description: 'Two short sentences that explain the video well.', hashtags: ['coding', 'Python', '#Shorts', 'dev']};
const rawOf = (sample) => ({...sample, ...meta});

test('every sample script passes the check', () => {
  for (const sample of Object.values(SAMPLES)) {
    const {spec} = cleanVideo(rawOf(sample), {accent: 2, music: 1});
    assert.equal(spec.accent, 2);
    assert.equal(spec.music, 1);
  }
});
test('every sample is between 15 and 56 seconds', () => {
  for (const [name, sample] of Object.entries(SAMPLES)) {
    const seconds = totalSeconds(cleanVideo(rawOf(sample)).spec);
    assert.ok(seconds >= 15 && seconds <= 56, `${name} is ${seconds.toFixed(1)}s`);
  }
});
test('hashtags are cleaned, #Shorts is dropped and at most 5 are kept', () => {
  const {meta: m} = cleanVideo({...rawOf(SAMPLES.tips), hashtags: ['#Shorts', 'coding tips', 'AI!', 'ai', 'a', 'b', 'c', 'd', 'e', 'f']});
  assert.deepEqual(m.hashtags, ['#codingtips', '#AI', '#a', '#b', '#c']);
});
test('emoji and control characters are removed', () => {
  const {spec} = cleanVideo({...rawOf(SAMPLES.tips), hook: 'Fast tips \u{1F680} for\tdevs\u0007 now'});
  assert.equal(spec.hook, 'Fast tips for devs now');
});
test('too few tips are rejected', () => {
  assert.throws(() => cleanVideo({...rawOf(SAMPLES.tips), items: SAMPLES.tips.items.slice(0, 2)}), /at least 3/);
});
test('too many tips are cut to 5', () => {
  const items = Array.from({length: 8}, (_, i) => ({heading: `Tip ${i + 1}`, detail: 'Short detail here.'}));
  assert.equal(cleanVideo({...rawOf(SAMPLES.tips), items}).spec.items.length, 5);
});
test('a long video is shortened by dropping tips', () => {
  const long = 'word '.repeat(21).trim();
  const items = Array.from({length: 5}, (_, i) => ({heading: `Heading number ${i + 1} is wordy`, detail: long}));
  const {spec} = cleanVideo({...rawOf(SAMPLES.tips), items});
  assert.ok(totalSeconds(spec) <= 56 && spec.items.length >= 3);
});
test('code lines that are too wide are rejected', () => {
  assert.throws(() => cleanVideo({...rawOf(SAMPLES.code), code: 'x = 1\n' + 'y'.repeat(40)}), /at most 36/);
});
test('unknown code language is rejected', () => {
  assert.throws(() => cleanVideo({...rawOf(SAMPLES.code), language: 'cobol'}), /language/);
});
test('a code step that points at a missing line is rejected', () => {
  assert.throws(() => cleanVideo({...rawOf(SAMPLES.code), steps: [{line: 99, text: 'nope'}, {line: 1, text: 'ok'}]}), /real line/);
});
test('tabs in code become spaces', () => {
  const {spec} = cleanVideo({...rawOf(SAMPLES.code), code: 'if x:\n\treturn 1', steps: [{line: 1, text: 'Check x.'}, {line: 2, text: 'Return one.'}]});
  assert.equal(spec.code, 'if x:\n  return 1');
});
test('unknown template is rejected', () => {
  assert.throws(() => cleanVideo({...rawOf(SAMPLES.tips), template: 'dance'}), /unknown template/);
});
test('a missing title is rejected', () => {
  assert.throws(() => cleanVideo({...rawOf(SAMPLES.tips), title: ''}), /title/);
});
test('versus needs two points per side', () => {
  assert.throws(() => cleanVideo({...rawOf(SAMPLES.versus), a: {label: 'Tabs', points: ['one']}}), /at least 2/);
});
test('hooks that differ only in case and punctuation count as the same', () => {
  assert.equal(normalizeHook('Tabs or Spaces?!'), normalizeHook('tabs or spaces'));
});

console.log(`\n${passed} checks passed${process.exitCode ? ', some failed' : ''}`);
