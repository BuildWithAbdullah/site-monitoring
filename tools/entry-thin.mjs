// The entry point stays wiring.
//
// A file that is only syntax checked has no coverage at all, and the entry
// point is where that bites, because it is the file every installed copy runs
// first. Every decision belongs in a module that takes its streams, its
// filesystem and its work as arguments; the entry point imports that module and
// calls it.
//
// The budget has no headroom. It is set to the number of branches the entry
// point needs and not one more, with a couple of lines of slack for formatting,
// so a new decision fails the build while a reflow does not. A test asserts
// that the budget equals the measured figure, so nobody can quietly raise it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BRANCH_BUDGET = 3;
export const LINE_BUDGET = 23;

const BRANCH_TOKENS = [
  /\bif\b/g, /\belse\b/g, /\bcatch\b/g, /\bcase\b/g, /\bwhile\b/g, /\bfor\b/g,
  /\?(?!\.)/g, /&&/g, /\|\|/g, /\?\?/g,
];

export async function measureEntry(root) {
  const path = join(root, 'bin', 'site-monitoring.mjs');
  const source = readFileSync(path, 'utf8');
  const { maskSource } = await import(pathToFileURL(join(root, 'src/scan/mask.mjs')).href);
  const { masked } = maskSource(source);
  let branches = 0;
  for (const token of BRANCH_TOKENS) {
    token.lastIndex = 0;
    branches += (masked.match(token) ?? []).length;
  }
  const lines = source.split('\n').filter((line) => {
    const trimmed = line.trim();
    return trimmed !== '' && !trimmed.startsWith('//');
  }).length;
  return { branches, lines, path };
}
