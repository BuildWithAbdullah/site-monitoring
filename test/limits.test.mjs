// The limits, one by one, and both halves of what each kind means.
//
// A limit that hides needs a blind case that reports nothing AND a contrast
// case that reports something. The second half is the one that does the work: a
// contrast case reporting nothing proves nothing, because a file with no
// problem in it also reports nothing.
//
// A limit that manufactures needs the opposite: a blind case that reports
// exactly the stated findings, and a contrast case that is clean.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditFile } from '../src/audit.mjs';
import { LIMITS, LIMIT_KINDS } from '../tools/limits.mjs';
import { FINDINGS, AREAS } from '../src/catalogue.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function tokensOf(relative) {
  const path = join(ROOT, 'limits', relative);
  const result = auditFile({ path, text: readFileSync(path, 'utf8') });
  return result.findings.map((f) => `${f.id}@${f.severity}`).sort();
}

for (const limit of LIMITS) {
  test(`${limit.slug}: the blind case reports exactly what is claimed for it`, () => {
    assert.deepEqual(tokensOf(limit.blind), [...limit.blindExpected].sort());
  });

  test(`${limit.slug}: the contrast case reports exactly what is claimed for it`, () => {
    assert.deepEqual(tokensOf(limit.contrast), [...limit.contrastExpected].sort());
  });

  if (limit.kind === 'hides') {
    test(`${limit.slug} hides a problem: the blind case is clean`, () => {
      assert.deepEqual(limit.blindExpected, []);
      assert.deepEqual(tokensOf(limit.blind), []);
    });

    test(`${limit.slug} hides a problem: the contrast case reports, or it proves nothing`, () => {
      assert.ok(limit.contrastExpected.length > 0, 'the manifest claims nothing for the contrast case');
      assert.ok(tokensOf(limit.contrast).length > 0, 'the contrast case reports nothing');
    });
  }

  if (limit.kind === 'manufactures') {
    test(`${limit.slug} manufactures a finding: the blind case reports it`, () => {
      assert.ok(limit.blindExpected.length > 0, 'the manifest claims nothing for the blind case');
      assert.ok(tokensOf(limit.blind).length > 0, 'the blind case reports nothing');
    });

    test(`${limit.slug} manufactures a finding: the contrast case is clean`, () => {
      assert.deepEqual(limit.contrastExpected, []);
      assert.deepEqual(tokensOf(limit.contrast), []);
    });
  }
}

test('every limit declares a known kind', () => {
  for (const limit of LIMITS) {
    assert.ok(LIMIT_KINDS.includes(limit.kind), `${limit.slug} declares ${limit.kind}`);
  }
});

test('both kinds of limit are present, so both sets of rules are exercised', () => {
  const kinds = new Set(LIMITS.map((l) => l.kind));
  for (const kind of LIMIT_KINDS) {
    assert.ok(kinds.has(kind), `no limit of the kind ${kind}`);
  }
});

test('every limit names an area that exists', () => {
  const areas = new Set(AREAS.map((a) => a.id));
  for (const limit of LIMITS) {
    assert.ok(areas.has(limit.area), `${limit.slug} names ${limit.area}`);
  }
});

test('every token a limit names is catalogued at a declared severity', () => {
  const declared = new Set(FINDINGS.flatMap((f) => f.severities.map((s) => `${f.id}@${s}`)));
  for (const limit of LIMITS) {
    for (const token of [...limit.blindExpected, ...limit.contrastExpected]) {
      assert.ok(declared.has(token), `${limit.slug} names ${token}`);
    }
  }
});

test('the blind and contrast cases are different files', () => {
  for (const limit of LIMITS) {
    assert.notEqual(limit.blind, limit.contrast, limit.slug);
  }
});

test('no limit claims both that it hides and that it manufactures', () => {
  for (const limit of LIMITS) {
    const both = limit.blindExpected.length > 0 && limit.contrastExpected.length > 0;
    assert.ok(!both, `${limit.slug} claims findings on both sides, so its kind is ambiguous`);
  }
});
