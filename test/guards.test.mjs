// The guards.
//
// These assert things about the test suite itself, and they live in their own
// file because a scanner that sits inside its own subject counts its own needle
// as a match and then reports the line doing the counting. Assembling the
// needle from fragments at run time does not fix that; moving the scanner out
// of its subject does.
//
// Every needle here is built at run time regardless, so that no file on disk
// contains the pattern being looked for.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackedFiles } from '../tools/tracked.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const SUBJECTS = ['test/pairs.test.mjs', 'test/limits.test.mjs'];
const THIS_FILE = 'test/guards.test.mjs';

function fragments(...parts) {
  return parts.join('');
}

function codeOf(rel) {
  // Comment lines are dropped before scanning, so a guard does not report the
  // prose that explains it. Every scanner in this repository does this.
  return read(rel).split('\n').filter((line) => !line.trim().startsWith('//'));
}

test('the corpus suites compare the actual findings as a set, never by containment', () => {
  const exact = fragments('deep', 'Equal');
  const reader = fragments('tokens', 'Of(');
  const loose = [fragments('.inc', 'ludes('), fragments('.so', 'me(')];
  for (const subject of SUBJECTS) {
    const lines = codeOf(subject);
    const declaration = fragments('function ', 'tokens', 'Of');
    const comparisons = lines
      .filter((line) => line.includes(reader))
      .filter((line) => !line.includes(declaration));
    assert.ok(comparisons.length > 0, `${subject} never reads the findings`);
    assert.ok(lines.some((line) => line.includes(exact)), `${subject} makes no exact comparison`);
    for (const line of comparisons) {
      for (const needle of loose) {
        assert.ok(!line.includes(needle),
          `${subject} compares the findings with ${needle}, which is a containment check `
          + 'and hides every false positive the corpus triggers');
      }
      const exactHere = line.includes(exact) || /\.length/.test(line);
      assert.ok(exactHere,
        `${subject} reads the findings on a line that makes no exact comparison: ${line.trim()}`);
    }
  }
});

test('the corpus suites assert on both sides of every pair and every limit', () => {
  const pairs = read('test/pairs.test.mjs');
  assert.ok(pairs.includes('pair.before'), 'the failing side is not asserted');
  assert.ok(pairs.includes('pair.after'), 'the corrected side is not asserted');
  const limits = read('test/limits.test.mjs');
  assert.ok(limits.includes('limit.blind'), 'the blind case is not asserted');
  assert.ok(limits.includes('limit.contrast'), 'the contrast case is not asserted');
});

test('the subjects do not read the guard back', () => {
  // If a subject read this file, the needles above would appear inside the
  // subject and the guard would be scanning its own text through it.
  const needle = fragments('guards', '.test');
  for (const subject of SUBJECTS) {
    const code = codeOf(subject).join('\n');
    assert.ok(!code.includes(needle), `${subject} reads the guard`);
  }
});

test('the guard is not its own subject', () => {
  assert.ok(!SUBJECTS.includes(THIS_FILE));
});

test('no test file in the suite skips or marks anything as todo', () => {
  const skip = fragments('{ sk', 'ip: true }');
  const todo = fragments('{ to', 'do: true }');
  for (const rel of trackedFiles(ROOT).filter((r) => r.startsWith('test/'))) {
    const text = read(rel);
    assert.ok(!text.includes(skip), `${rel} skips a test`);
    assert.ok(!text.includes(todo), `${rel} marks a test as todo`);
  }
});

test('a scanner that looks for a forbidden token drops comment lines first', () => {
  // The claim that scans the tree for long dashes builds its needles from code
  // points, so the verifier itself does not contain either character. This is
  // the test that would fail if somebody wrote them as literals.
  const text = read('tools/verify.mjs');
  assert.ok(text.includes('String.fromCharCode(0x2014)'));
  assert.ok(!text.includes(String.fromCharCode(0x2014)));
  assert.ok(!text.includes(String.fromCharCode(0x2013)));
});

test('the host purity claim does not carry a disallowed host as a literal', () => {
  // An earlier repository on this account declared a disallowed host as a
  // string literal inside the test that looks for disallowed hosts, and the
  // repository's own claim then reported the test.
  const text = read('tools/verify.mjs');
  assert.ok(!/https?:\/\/[a-z0-9.-]*\.(co|com|net|org|io|dev)\b/.test(
    text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
      .replace(/example\.(com|org|net)/g, 'reserved'),
  ), 'the verifier carries a host that is not a reserved example name');
});

test('the perturbation helper filters on the basename rather than on a substring', () => {
  const text = read('tools/perturb.mjs');
  const substring = fragments('includes(', "'/.git'");
  assert.ok(!text.includes(substring),
    'a substring test against the path also excludes .github and .gitignore');
  assert.ok(text.includes('basename('), 'the filter does not use the basename');
});
