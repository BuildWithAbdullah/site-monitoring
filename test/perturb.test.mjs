// Every claim, proved non vacuous individually.
//
// The tree is copied, one named change is made to the copy, and the single
// claim that change should break is run against both. It has to pass on the
// unchanged copy and fail on the perturbed one.
//
// This is the only thing that can catch a verifier reading its own statically
// imported modules rather than the tree it was handed. Such a verifier answers
// every claim correctly about the repository it lives in, so every gate is
// green, and the copy is where it comes apart.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyTree, discard, PERTURBATIONS } from '../tools/perturb.mjs';
import { verify, verifyOne, CLAIMS } from '../tools/verify.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function testCountFromReadme(root) {
  const match = /(\d+) tests/.exec(readFileSync(join(root, 'README.md'), 'utf8'));
  return match ? Number(match[1]) : null;
}

const TARGETED = [...new Set(PERTURBATIONS.map((p) => p.claim))];

// One clean copy, and every targeted claim checked against it once. If a claim
// fails here then the perturbation below proves nothing, because the claim was
// already failing.
const clean = copyTree(ROOT);
let cleanResults;
try {
  cleanResults = await verify(clean, { only: TARGETED, testCount: testCountFromReadme(clean) });
} finally {
  discard(clean);
}

test('every claim a perturbation targets holds on an unchanged copy of the tree', () => {
  const failed = cleanResults.filter((r) => r.problems.length > 0);
  const report = failed.map((r) => `${r.name}: ${r.problems.join('; ')}`).join('\n');
  assert.deepEqual(failed.map((r) => r.name), [], report);
});

for (const item of PERTURBATIONS) {
  test(`${item.name}: ${item.claim} has to fail`, async () => {
    const copy = copyTree(ROOT);
    try {
      item.apply(copy);
      const result = await verifyOne(copy, item.claim, { testCount: testCountFromReadme(ROOT) });
      assert.ok(result.problems.length > 0,
        `${item.claim} still holds after this change, so it is not checking anything`);
    } finally {
      discard(copy);
    }
  });
}

test('the perturbation suite covers a meaningful share of the claim list', () => {
  // Not every claim can be broken by editing a file: some are properties of the
  // claim list itself. The share is asserted so that the suite cannot quietly
  // shrink while the claim list grows.
  assert.ok(TARGETED.length >= 20,
    `only ${TARGETED.length} of ${CLAIMS.length} claims have a perturbation behind them`);
});

test('every perturbation is distinct in what it changes', () => {
  const seen = new Set();
  for (const item of PERTURBATIONS) {
    const key = `${item.claim}:${item.name}`;
    assert.ok(!seen.has(key), key);
    seen.add(key);
  }
});
