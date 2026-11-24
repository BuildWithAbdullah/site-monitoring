// The reusable tools.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackedFiles, parseIgnore, isIgnored } from '../tools/tracked.mjs';
import { statedOnOneLine, statesExactly, linesMentioning } from '../tools/stated.mjs';
import { testFilesFrom } from '../tools/count-tests.mjs';
import { measureEntry, BRANCH_BUDGET, LINE_BUDGET } from '../tools/entry-thin.mjs';
import { staleDocuments, DOCUMENTS } from '../tools/gen-docs.mjs';
import { expectedExitCodes } from '../tools/exit-codes.mjs';
import { corpusEntries } from '../tools/audit-verdicts.mjs';
import { copyTree, discard, PERTURBATIONS } from '../tools/perturb.mjs';
import { PAIRS } from '../tools/pairs.mjs';
import { LIMITS } from '../tools/limits.mjs';
import { FIXTURES } from '../tools/fixtures.mjs';
import { CLAIMS } from '../tools/verify.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function gitTree(files, ignore) {
  const dir = mkdtempSync(join(tmpdir(), 'site-monitoring-git-'));
  for (const [rel, text] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  writeFileSync(join(dir, '.gitignore'), ignore);
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['add', '-A'], { cwd: dir });
  const listed = spawnSync('git', ['ls-files'], { cwd: dir, encoding: 'utf8' });
  return { dir, fromGit: listed.stdout.split('\n').filter(Boolean).sort() };
}

test('the ignore matcher agrees with git on a plain tree', () => {
  const { dir, fromGit } = gitTree({
    'src/a.mjs': '',
    'src/b.mjs': '',
    'build/out.js': '',
    'notes.log': '',
  }, 'build/\n*.log\n');
  assert.deepEqual(trackedFiles(dir), fromGit);
});

test('the ignore matcher agrees with git on a negation', () => {
  const { dir, fromGit } = gitTree({
    'logs/keep.log': '',
    'logs/drop.log': '',
  }, '*.log\n!keep.log\n');
  assert.deepEqual(trackedFiles(dir), fromGit);
});

test('a negation cannot re-include a file inside an excluded directory', () => {
  // This is the case a hand written matcher almost always gets wrong, and git's
  // behaviour is that the directory exclusion wins.
  const { dir, fromGit } = gitTree({
    'build/keep.txt': '',
    'build/other.txt': '',
    'src/a.mjs': '',
  }, 'build/\n!build/keep.txt\n');
  assert.deepEqual(trackedFiles(dir), fromGit);
  assert.ok(!fromGit.includes('build/keep.txt'), 'git itself does not re-include it');
});

test('the ignore matcher agrees with git on an anchored pattern', () => {
  const { dir, fromGit } = gitTree({
    'out.json': '',
    'nested/out.json': '',
  }, '/out.json\n');
  assert.deepEqual(trackedFiles(dir), fromGit);
});

test('a comment and a blank line in the ignore file are not rules', () => {
  const rules = parseIgnore('# a comment\n\n*.log\n');
  assert.equal(rules.length, 1);
  assert.equal(isIgnored(rules, 'a.log', false), true);
  assert.equal(isIgnored(rules, 'a.txt', false), false);
});

test('the last matching rule wins', () => {
  const rules = parseIgnore('*.log\n!keep.log\n*.log\n');
  assert.equal(isIgnored(rules, 'keep.log', false), true);
});

test('the ignore matcher agrees with git on this repository', () => {
  const listed = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  if (listed.status !== 0) return; // not a checkout, which is fine outside CI
  const fromGit = listed.stdout.split('\n').filter(Boolean).sort();
  assert.deepEqual(trackedFiles(ROOT), fromGit);
});

test('a count stated once is found once', () => {
  const text = 'There are 64 catalogued findings here.\nAnd nothing else.';
  assert.equal(statedOnOneLine(text, (line) => line.includes('64 catalogued findings')).count, 1);
  assert.ok(statesExactly(text, 64, 'catalogued findings'));
});

test('a count stated twice is caught', () => {
  const text = 'There are 64 catalogued findings.\nStill 64 catalogued findings.';
  assert.equal(statedOnOneLine(text, (line) => line.includes('64 catalogued findings')).count, 2);
  assert.ok(!statesExactly(text, 64, 'catalogued findings'));
});

test('a count wrapped onto the next line is not found at all', () => {
  const text = 'There are 64\ncatalogued findings.';
  assert.ok(!statesExactly(text, 64, 'catalogued findings'));
});

test('lines mentioning a noun are reported with their line numbers', () => {
  const found = linesMentioning('one\n64 findings\nthree', 'findings');
  assert.deepEqual(found, [{ line: 2, text: '64 findings' }]);
});

test('the test file list comes out of the test script', () => {
  const text = JSON.stringify({ scripts: { test: 'node --test test/a.test.mjs test/b.test.mjs' } });
  assert.deepEqual(testFilesFrom(text), ['test/a.test.mjs', 'test/b.test.mjs']);
});

test('a reporter flag is not mistaken for a test file', () => {
  const text = JSON.stringify({
    scripts: { test: 'node --test --test-reporter=tools/count-tests.mjs test/a.test.mjs' },
  });
  assert.deepEqual(testFilesFrom(text), ['test/a.test.mjs']);
});

test('the entry point branch budget equals the measured figure, with no headroom', async () => {
  const measured = await measureEntry(ROOT);
  assert.equal(BRANCH_BUDGET, measured.branches,
    'the budget has headroom, so a new decision could be added without failing the build');
  assert.ok(measured.lines <= LINE_BUDGET);
  assert.ok(LINE_BUDGET - measured.lines <= 3, 'the line budget has more than a formatting change of slack');
});

test('the generated documents match their builder', async () => {
  assert.deepEqual(await staleDocuments(ROOT), []);
  for (const doc of DOCUMENTS) {
    assert.ok(existsSync(join(ROOT, doc)), doc);
  }
});

test('the generated documents say they are generated', () => {
  for (const doc of DOCUMENTS) {
    const text = readFileSync(join(ROOT, doc), 'utf8');
    assert.ok(text.includes('Generated from'), doc);
    assert.ok(text.includes('gen-docs.mjs'), doc);
  }
});

test('the expected exit codes are derived from the manifests and nothing else', async () => {
  const cases = await expectedExitCodes(ROOT);
  const byLabel = new Map(cases.map((c) => [c.label, c.expected]));
  // A pair whose worst declared severity is low has to expect 1, one with a
  // high has to expect 2, and a corrected side with no residual has to expect 0.
  const low = PAIRS.find((p) => p.expected.every((t) => t.endsWith('@low')));
  assert.ok(low, 'no pair reaches only low findings');
  assert.equal(byLabel.get(`${low.slug} before`), 1);
  const high = PAIRS.find((p) => p.expected.some((t) => t.endsWith('@high')));
  assert.equal(byLabel.get(`${high.slug} before`), 2);
  const clean = PAIRS.find((p) => p.residual.length === 0);
  assert.equal(byLabel.get(`${clean.slug} after`), 0);
});

test('every artefact in the corpus is covered by one entry', () => {
  const entries = corpusEntries({ pairs: { PAIRS }, limits: { LIMITS }, fixtures: { FIXTURES } });
  assert.equal(entries.length, PAIRS.length * 2 + LIMITS.length * 2 + FIXTURES.length);
  for (const entry of entries) {
    assert.ok(existsSync(join(ROOT, entry.file)), entry.file);
  }
});

test('the perturbation copy keeps the workflow file and the ignore rules', () => {
  // A substring filter on the path excludes .github and .gitignore along with
  // .git, which silently removes the workflow file and the ignore rules from
  // every copied tree and makes several claims fail on an unchanged copy.
  const copy = copyTree(ROOT);
  try {
    assert.ok(existsSync(join(copy, '.github', 'workflows', 'ci.yml')));
    assert.ok(existsSync(join(copy, '.gitignore')));
    assert.ok(!existsSync(join(copy, '.git')));
  } finally {
    discard(copy);
  }
});

test('every perturbation names a claim that exists', () => {
  const names = new Set(CLAIMS.map((c) => c.name));
  for (const item of PERTURBATIONS) {
    assert.ok(names.has(item.claim), `${item.name} names the claim ${item.claim}`);
  }
});

test('every perturbation has a name of its own', () => {
  const seen = new Set();
  for (const item of PERTURBATIONS) {
    assert.ok(!seen.has(item.name), item.name);
    seen.add(item.name);
  }
});
