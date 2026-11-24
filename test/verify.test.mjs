// The verifier, run against this repository.
//
// The test count this passes in comes from the README rather than from the
// counter, which makes that one claim trivially true here. That is deliberate:
// a verifier that ran the suite could not be called from inside the suite. The
// real comparison happens in the CI job that runs tools/verify.mjs, where the
// count comes from spawning the counter and the README is what gets checked.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify, verifyOne, CLAIMS, CLAIM_COUNT, hostIsReserved } from '../tools/verify.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function testCountFromReadme() {
  const text = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const match = /(\d+) tests/.exec(text);
  return match ? Number(match[1]) : null;
}

const results = await verify(ROOT, { testCount: testCountFromReadme() });

test('every claim in the fixed list holds against this repository', () => {
  const failed = results.filter((r) => r.problems.length > 0);
  const report = failed.map((r) => `${r.name}: ${r.problems.join('; ')}`).join('\n');
  assert.deepEqual(failed.map((r) => r.name), [], report);
});

for (const claim of CLAIMS) {
  test(`claim ${claim.name} holds`, () => {
    const found = results.find((r) => r.name === claim.name);
    assert.ok(found, `${claim.name} did not run`);
    assert.deepEqual(found.problems, []);
  });
}

test('the claim list is a fixed list of named claims', () => {
  assert.equal(CLAIM_COUNT, CLAIMS.length);
  for (const claim of CLAIMS) {
    assert.equal(typeof claim.name, 'string');
    assert.ok(claim.name.includes('/'), `${claim.name} has no area prefix`);
    assert.equal(typeof claim.run, 'function');
  }
});

test('asking for a claim that does not exist is an error rather than a pass', async () => {
  await assert.rejects(() => verifyOne(ROOT, 'no/such-claim'), /no claim named/);
});

test('a tree whose modules will not load fails every claim rather than throwing', async () => {
  const broken = await verify(join(ROOT, 'does-not-exist'));
  assert.equal(broken.length, CLAIMS.length);
  for (const result of broken) {
    assert.ok(result.problems.length > 0, result.name);
  }
});

test('reserved example hosts are accepted and anything else is not', () => {
  for (const host of ['example.com', 'shop.example.com', 'admin.internal.example',
    'api.example.test', 'thing.invalid', 'localhost', 'rum.example.com:8080']) {
    assert.ok(hostIsReserved(host), host);
  }
  for (const host of ['shop.acmeretail.co', 'example.com.evil.net', 'github.com']) {
    assert.ok(!hostIsReserved(host), host);
  }
});
