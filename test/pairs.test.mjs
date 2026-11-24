// The corpus, pair by pair.
//
// Each side of each pair is compared against the manifest as an EXACT set, in
// both directions. The failing side has to report exactly what the manifest
// says and nothing else, and the corrected side has to report exactly its
// declared residual, which is usually nothing at all.
//
// The guard that checks this file actually makes exact comparisons lives in
// test/guards.test.mjs, in a different file, because a scanner that sits inside
// its own subject counts its own needle as a match and then reports the line
// doing the counting.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditFile } from '../src/audit.mjs';
import { PAIRS } from '../tools/pairs.mjs';
import { FINDINGS } from '../src/catalogue.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function tokensOf(relative) {
  const path = join(ROOT, 'patterns', relative);
  const result = auditFile({ path, text: readFileSync(path, 'utf8') });
  return result.findings.map((f) => `${f.id}@${f.severity}`).sort();
}

for (const pair of PAIRS) {
  test(`${pair.slug}: the failing example reports exactly what the manifest claims`, () => {
    assert.deepEqual(tokensOf(pair.before), [...pair.expected].sort());
  });

  test(`${pair.slug}: the corrected example reports exactly its declared residual`, () => {
    assert.deepEqual(tokensOf(pair.after), [...pair.residual].sort());
  });
}

test('every pair names an area that exists', () => {
  const areas = new Set(FINDINGS.map((f) => f.area));
  for (const pair of PAIRS) {
    assert.ok(areas.has(pair.area), `${pair.slug} names ${pair.area}`);
  }
});

test('every pair expects at least one finding, or it is not a pair', () => {
  for (const pair of PAIRS) {
    assert.ok(pair.expected.length > 0, pair.slug);
  }
});

test('a residual is a subset of what the failing side reports', () => {
  for (const pair of PAIRS) {
    for (const token of pair.residual) {
      assert.ok(pair.expected.includes(token),
        `${pair.slug} claims the residual ${token} which the failing side does not report`);
    }
  }
});

test('every expected token names a catalogued finding at a declared severity', () => {
  const declared = new Set(FINDINGS.flatMap((f) => f.severities.map((s) => `${f.id}@${s}`)));
  for (const pair of PAIRS) {
    for (const token of [...pair.expected, ...pair.residual]) {
      assert.ok(declared.has(token), `${pair.slug} names ${token}`);
    }
  }
});

test('the two sides of a pair are different files', () => {
  for (const pair of PAIRS) {
    assert.notEqual(pair.before, pair.after, pair.slug);
  }
});

test('the corrected side of a pair fixes something', () => {
  for (const pair of PAIRS) {
    assert.ok(pair.residual.length < pair.expected.length,
      `${pair.slug} corrects nothing at all`);
  }
});
