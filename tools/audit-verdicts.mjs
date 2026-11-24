// The corpus pass.
//
// Runs the checkers over every artefact in the corpus and compares what came
// back against the manifests, as an EXACT set in both directions. This is the
// programmatic counterpart of tools/exit-codes.mjs, which asks the same
// question of the real binary.
//
// The tree under test is loaded by dynamic import from the root it is given,
// not from this file's own imports, so a copy of the repository with an edited
// manifest is actually judged on that copy.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

async function loadTree(root) {
  const importFrom = (rel) => import(pathToFileURL(join(root, rel)).href);
  const [audit, pairs, limits, fixtures, catalogue, severity] = await Promise.all([
    importFrom('src/audit.mjs'),
    importFrom('tools/pairs.mjs'),
    importFrom('tools/limits.mjs'),
    importFrom('tools/fixtures.mjs'),
    importFrom('src/catalogue.mjs'),
    importFrom('src/severity.mjs'),
  ]);
  return { audit, pairs, limits, fixtures, catalogue, severity };
}

export function tokensFor(auditModule, path, text) {
  const result = auditModule.auditFile({ path, text });
  return result.findings.map((f) => `${f.id}@${f.severity}`).sort();
}

function sorted(list) {
  return [...list].sort();
}

function same(a, b) {
  const left = sorted(a);
  const right = sorted(b);
  return left.length === right.length && left.every((value, i) => value === right[i]);
}

/**
 * Every artefact in the corpus, with the exact token set the manifest claims
 * for it. One flat list so a caller can walk the whole corpus once.
 */
export function corpusEntries(tree) {
  const out = [];
  for (const pair of tree.pairs.PAIRS) {
    out.push({ role: 'before', slug: pair.slug, file: join('patterns', pair.before), expected: pair.expected });
    out.push({ role: 'after', slug: pair.slug, file: join('patterns', pair.after), expected: pair.residual });
  }
  for (const fixture of tree.fixtures.FIXTURES) {
    out.push({ role: 'fixture', slug: fixture.slug, file: join('fixtures', fixture.file), expected: fixture.expected });
  }
  for (const limit of tree.limits.LIMITS) {
    out.push({ role: 'blind', slug: limit.slug, file: join('limits', limit.blind), expected: limit.blindExpected });
    out.push({ role: 'contrast', slug: limit.slug, file: join('limits', limit.contrast), expected: limit.contrastExpected });
  }
  return out;
}

/**
 * @returns {Promise<{problems: string[], checked: number, tree: object}>}
 */
export async function auditVerdicts(root) {
  const tree = await loadTree(root);
  const problems = [];
  const entries = corpusEntries(tree);
  for (const entry of entries) {
    const full = join(root, entry.file);
    if (!existsSync(full)) {
      problems.push(`${entry.slug} ${entry.role}: ${entry.file} does not exist`);
      continue;
    }
    const actual = tokensFor(tree.audit, full, readFileSync(full, 'utf8'));
    if (!same(actual, entry.expected)) {
      const missing = sorted(entry.expected).filter((t) => !actual.includes(t));
      const extra = actual.filter((t) => !entry.expected.includes(t));
      problems.push(
        `${entry.slug} ${entry.role} (${entry.file}): `
        + `${missing.length ? `missing ${missing.join(',')} ` : ''}`
        + `${extra.length ? `unexpected ${extra.join(',')}` : ''}`.trim(),
      );
    }
  }
  return { problems, checked: entries.length, tree };
}
