// The test counter.
//
// One file, two jobs. Its default export is a custom reporter for node:test,
// and running the file spawns `node --test` against itself and prints the
// counts the reporter produced.
//
// It is a custom reporter rather than a parse of the standard output because
// the standard output is version dependent: the same suite prints `# tests 264`
// on one release and `info tests 264` on another. The structured event stream
// is version dependent too, in a subtler way, because some releases forward one
// test:pass per file rather than per test and `details.type` is 'suite' on some
// and undefined on others. Every per test event is present in a custom
// reporter, so selecting everything whose details are not a suite is the one
// form that counts the same number everywhere.
//
// A file that fails to load is counted as one failing test, which is safe
// because the failure count is then not zero and the build is red. Never quote
// a count from a red run.

import { spawn } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export default async function* countingReporter(source) {
  let pass = 0;
  let fail = 0;
  for await (const event of source) {
    const kind = event.data && event.data.details ? event.data.details.type : undefined;
    if (kind === 'suite') continue;
    if (event.type === 'test:pass') pass += 1;
    else if (event.type === 'test:fail') fail += 1;
  }
  yield `${JSON.stringify({ pass, fail, total: pass + fail })}\n`;
}

/**
 * The test files, read out of scripts.test in package.json rather than kept in
 * a second list that would drift. The suite asserts that this list names every
 * test file on disk, which is what stops a new test file being written and
 * silently never run.
 */
export function testFilesFrom(packageJsonText) {
  const scripts = JSON.parse(packageJsonText).scripts ?? {};
  const command = scripts.test ?? '';
  return command
    .split(/\s+/)
    .filter((part) => part.endsWith('.mjs') && !part.startsWith('--'))
    .filter((part) => !part.includes('count-tests'));
}

export async function countTests(root) {
  const self = fileURLToPath(import.meta.url);
  const files = testFilesFrom(readFileSync(join(root, 'package.json'), 'utf8'));
  if (files.length === 0) throw new Error('no test files found in scripts.test');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      '--test',
      `--test-reporter=${pathToFileURL(self).href}`,
      '--test-reporter-destination=stdout',
      ...files,
    ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', reject);
    child.on('close', () => {
      const line = out.trim().split('\n').filter(Boolean).pop();
      if (!line) {
        reject(new Error(`the reporter produced nothing. stderr: ${err.slice(0, 400)}`));
        return;
      }
      try {
        resolve(JSON.parse(line));
      } catch {
        reject(new Error(`the reporter produced something unreadable: ${line.slice(0, 200)}`));
      }
    });
  });
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const counts = await countTests(root);
  process.stdout.write(`${JSON.stringify(counts)}\n`);
  process.exitCode = counts.fail === 0 ? 0 : 1;
}
