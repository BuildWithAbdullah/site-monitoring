// The other half of the engines floor.
//
// Installing at the declared floor proves nothing on its own, because the
// install succeeds whether or not the floor is being enforced. This raises the
// floor beyond the running version and requires the install to be refused. If
// it is not refused then --engine-strict is doing nothing, and the job that
// installs at the floor is not a test of anything.
//
// It lives here rather than inline in the workflow because the workflow is
// written in the subset of YAML this repository's own reader handles, and a
// multi line shell script needs a block scalar, which that reader does not
// read.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const IMPOSSIBLE_FLOOR = '>=99.0.0';

export function raiseFloor(root, floor = IMPOSSIBLE_FLOOR) {
  const path = join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  const previous = pkg.engines.node;
  pkg.engines.node = floor;
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
  return previous;
}

export function installRefused(root) {
  const result = spawnSync('npm', ['install', '--engine-strict'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, npm_config_engine_strict: 'true' },
  });
  return { refused: result.status !== 0, status: result.status, stderr: result.stderr ?? '' };
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
  raiseFloor(root);
  const result = installRefused(root);
  if (result.refused) {
    process.stdout.write(`refused with status ${result.status}, which is what makes the other job a test\n`);
  } else {
    process.stderr.write(`the install succeeded against a floor of ${IMPOSSIBLE_FLOOR}, so `
      + 'engine strict is doing nothing and the other job proves nothing\n');
    process.exitCode = 1;
  }
}
