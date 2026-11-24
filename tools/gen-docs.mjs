// The documents are generated from the manifests.
//
// A paragraph saying a checker cannot see something still reads correctly after
// the checker learns to see it, and a reader then trusts a caveat that is no
// longer true. So the finding list and the limits document are built from the
// catalogue and the limits manifest, and CI fails when either is stale.
//
// The comparison is against the builder, never a regeneration by the checker. A
// verifier that runs the generator and then reads the file always passes.

import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const DOCUMENTS = ['docs/FINDINGS.md', 'docs/LIMITS.md'];

async function tree(root) {
  const importFrom = (rel) => import(pathToFileURL(join(root, rel)).href);
  const [catalogue, limits, pairs] = await Promise.all([
    importFrom('src/catalogue.mjs'),
    importFrom('tools/limits.mjs'),
    importFrom('tools/pairs.mjs'),
  ]);
  return { catalogue, limits, pairs };
}

function findingsDocument({ catalogue, pairs }) {
  const { AREAS, FINDINGS } = catalogue;
  const reachedBy = new Map();
  for (const pair of pairs.PAIRS) {
    for (const token of pair.expected) {
      const id = token.split('@')[0];
      if (!reachedBy.has(id)) reachedBy.set(id, []);
      if (!reachedBy.get(id).includes(pair.slug)) reachedBy.get(id).push(pair.slug);
    }
  }
  const lines = [
    '# Findings',
    '',
    'Generated from `src/catalogue.mjs` by `node tools/gen-docs.mjs`. Editing this',
    'file by hand will fail CI.',
    '',
    `${FINDINGS.length} findings across ${AREAS.length} areas. One entry per reason, never one per`,
    'check. The severities column is the complete set the finding can be emitted',
    'at, and both directions of that are asserted: a severity a run produces that',
    'is not listed fails the build, and a severity listed that no artefact ever',
    'produces fails the build as well.',
    '',
  ];
  for (const area of AREAS) {
    const own = FINDINGS.filter((f) => f.area === area.id);
    lines.push(`## ${area.title}`, '', area.summary, '', `${own.length} findings.`, '');
    for (const finding of own) {
      lines.push(`### \`${finding.id}\``, '');
      lines.push(`**${finding.title}**`, '');
      lines.push(`Severities: ${finding.severities.map((s) => `\`${s}\``).join(', ')}`, '');
      lines.push(finding.reason, '');
      lines.push(`*Remedy.* ${finding.remedy}`, '');
      const pairsFor = reachedBy.get(finding.id) ?? [];
      lines.push(`*Examples.* ${pairsFor.map((s) => `\`${s}\``).join(', ')}`, '');
    }
  }
  return `${lines.join('\n')}`;
}

function limitsDocument({ limits }) {
  const { LIMITS } = limits;
  const hides = LIMITS.filter((l) => l.kind === 'hides');
  const manufactures = LIMITS.filter((l) => l.kind === 'manufactures');
  const lines = [
    '# Limits',
    '',
    'Generated from `tools/limits.mjs` by `node tools/gen-docs.mjs`. Editing this',
    'file by hand will fail CI.',
    '',
    `${LIMITS.length} limits: ${hides.length} that hide a problem and ${manufactures.length} that manufacture a finding.`,
    'Each one carries two artefacts in `limits/`, and the suite asserts both',
    'halves of what its kind means.',
    '',
    'A limit that **hides** means the blind case reports nothing when there is',
    'something to report. The suite requires the blind artefact to be clean and',
    'the contrast artefact to report, because a contrast case that reports',
    'nothing proves nothing: a file with no problem in it also reports nothing.',
    '',
    'A limit that **manufactures** means the blind case reports something that is',
    'not a problem. The suite requires the blind artefact to report exactly the',
    'stated findings and the contrast artefact to be clean.',
    '',
  ];
  for (const [kind, group] of [['Limits that hide a problem', hides], ['Limits that manufacture a finding', manufactures]]) {
    lines.push(`## ${kind}`, '');
    for (const limit of group) {
      lines.push(`### \`${limit.slug}\``, '');
      lines.push(`**${limit.title}**`, '');
      lines.push(limit.detail, '');
      lines.push(`Area: \`${limit.area}\``, '');
      lines.push(`Blind case: \`limits/${limit.blind}\``);
      lines.push(limit.blindExpected.length
        ? `, reporting ${limit.blindExpected.map((t) => `\`${t}\``).join(', ')}`
        : ', which reports nothing');
      lines.push('');
      lines.push(`Contrast case: \`limits/${limit.contrast}\``);
      lines.push(limit.contrastExpected.length
        ? `, reporting ${limit.contrastExpected.map((t) => `\`${t}\``).join(', ')}`
        : ', which is clean');
      lines.push('');
    }
  }
  return `${lines.join('\n')}`;
}

export async function expectedDocuments(root) {
  const loaded = await tree(root);
  return {
    'docs/FINDINGS.md': `${findingsDocument(loaded)}\n`,
    'docs/LIMITS.md': `${limitsDocument(loaded)}\n`,
  };
}

export async function staleDocuments(root) {
  const expected = await expectedDocuments(root);
  const stale = [];
  for (const [rel, text] of Object.entries(expected)) {
    let actual = null;
    try {
      actual = readFileSync(join(root, rel), 'utf8');
    } catch {
      stale.push(`${rel} is missing`);
      continue;
    }
    if (actual !== text) stale.push(`${rel} does not match its builder`);
  }
  return stale;
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
  if (process.argv.includes('--check')) {
    const stale = await staleDocuments(root);
    for (const problem of stale) process.stderr.write(`${problem}\n`);
    process.exitCode = stale.length === 0 ? 0 : 1;
  } else {
    const expected = await expectedDocuments(root);
    for (const [rel, text] of Object.entries(expected)) {
      writeFileSync(join(root, rel), text);
      process.stdout.write(`wrote ${rel}\n`);
    }
  }
}
