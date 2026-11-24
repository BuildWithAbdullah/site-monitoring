// Running the thing, not only its tests.
//
// Spawns the real binary over every artefact in the corpus and compares the
// exit code against one DERIVED from the manifest and the severity table, never
// from a list kept in this file. The derivation is the point: a severity added
// to a finding changes what this tool expects without anybody editing it.
//
// The binary is run by path and again through a symlink, because npm installs a
// bin as a symlink and Node resolves a module path to its real path. A
// main module guard that compares an unresolved argv[1] against import.meta.url
// works perfectly by path and does nothing at all through the link.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function expectedExitCodes(root) {
  const importFrom = (rel) => import(pathToFileURL(join(root, rel)).href);
  const [{ PAIRS }, { LIMITS }, { FIXTURES }, { exitCodeFor }] = await Promise.all([
    importFrom('tools/pairs.mjs'),
    importFrom('tools/limits.mjs'),
    importFrom('tools/fixtures.mjs'),
    importFrom('src/severity.mjs'),
  ]);
  const severityOf = (token) => token.split('@')[1];
  const entry = (file, tokens, label) => ({
    file,
    label,
    expected: exitCodeFor(tokens.map(severityOf)),
  });
  const out = [];
  for (const pair of PAIRS) {
    out.push(entry(join('patterns', pair.before), pair.expected, `${pair.slug} before`));
    out.push(entry(join('patterns', pair.after), pair.residual, `${pair.slug} after`));
  }
  for (const fixture of FIXTURES) {
    out.push(entry(join('fixtures', fixture.file), fixture.expected, `${fixture.slug} fixture`));
  }
  for (const limit of LIMITS) {
    out.push(entry(join('limits', limit.blind), limit.blindExpected, `${limit.slug} blind`));
    out.push(entry(join('limits', limit.contrast), limit.contrastExpected, `${limit.slug} contrast`));
  }
  return out;
}

export function runBinary(binary, args, cwd) {
  const result = spawnSync(process.execPath, [binary, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

export function linkedBinary(root) {
  const dir = mkdtempSync(join(tmpdir(), 'site-monitoring-bin-'));
  const link = join(dir, 'site-monitoring');
  symlinkSync(join(root, 'bin', 'site-monitoring.mjs'), link);
  return link;
}

/**
 * @returns {Promise<{problems: string[], runs: number}>}
 */
export async function checkExitCodes(root, { throughSymlink = true } = {}) {
  const cases = await expectedExitCodes(root);
  const direct = join(root, 'bin', 'site-monitoring.mjs');
  const binaries = [{ name: 'path', binary: direct }];
  if (throughSymlink) binaries.push({ name: 'symlink', binary: linkedBinary(root) });
  const problems = [];
  let runs = 0;
  for (const { name, binary } of binaries) {
    for (const mode of [[], ['--json']]) {
      for (const item of cases) {
        if (!existsSync(join(root, item.file))) {
          problems.push(`${item.label}: ${item.file} does not exist`);
          continue;
        }
        const result = runBinary(binary, [item.file, ...mode], root);
        runs += 1;
        if (result.status !== item.expected) {
          problems.push(`${item.label} via ${name}${mode.length ? ' --json' : ''}: `
            + `exit ${result.status}, expected ${item.expected}`);
        }
        if (mode.length && result.status !== 64) {
          let parsed;
          try {
            parsed = JSON.parse(result.stdout);
          } catch {
            problems.push(`${item.label} via ${name} --json: output was not JSON`);
            continue;
          }
          if (parsed.exitCode !== item.expected) {
            problems.push(`${item.label} via ${name} --json: reported exitCode `
              + `${parsed.exitCode}, expected ${item.expected}`);
          }
        }
      }
    }
  }
  return { problems, runs };
}
