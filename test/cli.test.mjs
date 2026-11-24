// The command line.
//
// Every decision is in src/cli.mjs, which takes its streams, its filesystem and
// its work as arguments, so all of it can be tested without spawning anything.
// The entry point is wiring, and tools/entry-thin.mjs fails the build if a
// decision moves back into it. What is spawned here is the real binary, by path
// and through a symlink, because npm installs a bin as a symlink and a guard
// that compares an unresolved argv[1] against import.meta.url works perfectly
// by path and does nothing at all through the link.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import nodeFs, { mkdtempSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, collectFiles, run, USAGE, EXIT_USAGE } from '../src/cli.mjs';
import { auditAll } from '../src/audit.mjs';
import { renderText, renderJson } from '../src/report.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BINARY = join(ROOT, 'bin', 'site-monitoring.mjs');

function fakeIo(argv, files) {
  const out = [];
  const err = [];
  return {
    io: {
      argv,
      out: { write: (s) => out.push(s) },
      err: { write: (s) => err.push(s) },
      fs: {
        statSync: (path) => ({ isDirectory: () => path.endsWith('/') }),
        readdirSync: () => [],
        readFileSync: (path) => files[path],
      },
    },
    out,
    err,
  };
}

const WORK = { auditAll, renderText, renderJson };

test('a path is parsed and the default is text output', () => {
  assert.deepEqual(parseArgs(['a.json']), { paths: ['a.json'], json: false, quiet: false });
});

test('the options are recognised in any order', () => {
  assert.deepEqual(parseArgs(['--json', 'a.json', '--quiet']),
    { paths: ['a.json'], json: true, quiet: true });
});

test('no path is a usage error', () => {
  assert.equal(parseArgs([]).error, 'no path given');
  assert.equal(parseArgs(['--json']).error, 'no path given');
});

test('an unknown option is a usage error that names the option', () => {
  assert.ok(parseArgs(['--nonsense', 'a.json']).error.includes('--nonsense'));
});

test('help is not a usage error', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-h']).help, true);
});

test('help prints the usage text and succeeds', () => {
  const { io, out } = fakeIo(['--help'], {});
  assert.equal(run(io, WORK), 0);
  assert.ok(out.join('').includes(USAGE.split('\n')[0]));
});

test('a usage error prints the usage text to the error stream and exits 64', () => {
  const { io, out, err } = fakeIo([], {});
  assert.equal(run(io, WORK), EXIT_USAGE);
  assert.equal(out.length, 0);
  assert.ok(err.join('').includes('no path given'));
});

test('a path that cannot be read is a usage error', () => {
  const io = {
    argv: ['missing.json'],
    out: { write: () => {} },
    err: { write: () => {} },
    fs: { statSync: () => { throw new Error('ENOENT'); } },
  };
  assert.equal(run(io, WORK), EXIT_USAGE);
});

test('a clean file exits zero and a high severity finding exits two', () => {
  const clean = '{"findings":[],"generatedAt":"2026-01-01T00:00:00Z"}';
  const problem = JSON.stringify({ alerts: [{ id: 'a' }] });
  const a = fakeIo(['clean.json'], { 'clean.json': clean });
  assert.equal(run(a.io, WORK), 0);
  const b = fakeIo(['bad.json'], { 'bad.json': problem });
  assert.equal(run(b.io, WORK), 2);
});

test('a finding with nothing high exits one', () => {
  const text = '{"findings":[{"id":"a"}]}';
  const { io } = fakeIo(['baseline.json'], { 'baseline.json': text });
  assert.equal(run(io, WORK), 1);
});

test('quiet prints nothing and still answers with the exit code', () => {
  const text = JSON.stringify({ alerts: [{ id: 'a' }] });
  const { io, out } = fakeIo(['bad.json', '--quiet'], { 'bad.json': text });
  assert.equal(run(io, WORK), 2);
  assert.equal(out.length, 0);
});

test('json output is parseable and carries the same exit code it returns', () => {
  const text = JSON.stringify({ alerts: [{ id: 'a' }] });
  const { io, out } = fakeIo(['bad.json', '--json'], { 'bad.json': text });
  const code = run(io, WORK);
  const parsed = JSON.parse(out.join(''));
  assert.equal(parsed.exitCode, code);
  assert.ok(parsed.summary.total > 0);
});

test('collecting from a directory skips the directories nothing should be audited in', () => {
  const dir = mkdtempSync(join(tmpdir(), 'site-monitoring-walk-'));
  mkdirSync(join(dir, 'node_modules'));
  mkdirSync(join(dir, 'nested'));
  writeFileSync(join(dir, 'a.json'), '{}');
  writeFileSync(join(dir, 'README.md'), 'not audited');
  writeFileSync(join(dir, 'node_modules', 'b.json'), '{}');
  writeFileSync(join(dir, 'nested', 'c.yml'), 'name: x');
  const found = collectFiles(nodeFs, dir);
  assert.deepEqual(found.map((p) => p.slice(dir.length + 1)).sort(), ['a.json', 'nested/c.yml']);
});

test('collecting from a single file gives that file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'site-monitoring-one-'));
  const file = join(dir, 'a.json');
  writeFileSync(file, '{}');
  assert.deepEqual(collectFiles(nodeFs, file), [file]);
});

test('the real binary runs by path', () => {
  const result = spawnSync(process.execPath, [BINARY, 'patterns/checks-minimal.before.json'],
    { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.ok(result.stdout.includes('check-no-timeout'));
});

test('the real binary runs through a symlink, which is how npm installs it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'site-monitoring-link-'));
  const link = join(dir, 'site-monitoring');
  symlinkSync(BINARY, link);
  const result = spawnSync(process.execPath, [link, 'patterns/checks-minimal.before.json'],
    { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.ok(result.stdout.includes('check-no-timeout'),
    'the binary printed nothing, which is what a main module guard that does not resolve its paths does');
});

test('the real binary walks a directory', () => {
  const result = spawnSync(process.execPath, [BINARY, 'patterns', '--quiet'],
    { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
});

test('the real binary reports a usage error on the error stream', () => {
  const result = spawnSync(process.execPath, [BINARY], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 64);
  assert.ok(result.stderr.includes('no path given'));
});

test('the two output modes report the same findings', () => {
  const file = 'patterns/runner-secret-echo.before.yml';
  const text = spawnSync(process.execPath, [BINARY, file], { cwd: ROOT, encoding: 'utf8' });
  const json = spawnSync(process.execPath, [BINARY, file, '--json'], { cwd: ROOT, encoding: 'utf8' });
  const fromText = [...text.stdout.matchAll(/^\s{2}(high|medium|low)\s+([a-z0-9-]+)/gm)]
    .map((m) => `${m[2]}@${m[1]}`).sort();
  const fromJson = JSON.parse(json.stdout).files
    .flatMap((f) => f.findings.map((x) => `${x.id}@${x.severity}`)).sort();
  assert.deepEqual(fromText, fromJson);
  assert.equal(text.status, json.status);
});

test('a skipped file is reported as skipped in both modes', () => {
  const file = 'limits/unknown-config-shape.blind.json';
  const text = spawnSync(process.execPath, [BINARY, file], { cwd: ROOT, encoding: 'utf8' });
  const json = spawnSync(process.execPath, [BINARY, file, '--json'], { cwd: ROOT, encoding: 'utf8' });
  assert.ok(text.stdout.includes('skipped'));
  assert.equal(JSON.parse(json.stdout).files[0].kind, null);
  assert.equal(text.status, 0);
  assert.equal(json.status, 0);
});
