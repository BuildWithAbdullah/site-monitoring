// The verifier.
//
// A fixed list of named claims. Each one takes a context and returns the
// problems it found, so the list is fully exercised by the test suite without
// the suite ever running itself: the command line fills the test count by
// spawning the counter, and the suite fills it from the README.
//
// Two rules shape everything here.
//
// First, a claim loads the tree it was given. Every module the claims read is
// imported dynamically from the root under test, never from this file's own
// imports. A verifier that compares its statically imported catalogue against
// files under a given root answers correctly about the repository it lives in
// and tells you nothing about the tree you handed it, and every gate is green
// while it does so. The perturbation suite is what catches that, and it is the
// only thing that can.
//
// Second, a tree whose modules will not load fails every claim rather than
// taking the verifier down with it.

import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { trackedFiles } from './tracked.mjs';
import { statedOnOneLine } from './stated.mjs';
import { auditVerdicts, corpusEntries, tokensFor } from './audit-verdicts.mjs';
import { measureEntry, BRANCH_BUDGET, LINE_BUDGET } from './entry-thin.mjs';
import { staleDocuments } from './gen-docs.mjs';
import { checkExitCodes, runBinary } from './exit-codes.mjs';

// Hosts are allowed by the last labels of their name. Everything in the corpus
// has to be a reserved example name, so that nothing here can be mistaken for a
// real site and nothing can accidentally be requested by a reader running the
// examples.
const RESERVED_LAST_LABELS = new Set(['example', 'test', 'invalid', 'localhost']);
const RESERVED_SUFFIXES = ['.example.com', '.example.org', '.example.net'];
const RESERVED_EXACT = new Set(['example.com', 'example.org', 'example.net']);

export function hostIsReserved(host) {
  const name = host.toLowerCase().replace(/:\d+$/, '');
  if (RESERVED_EXACT.has(name)) return true;
  if (RESERVED_SUFFIXES.some((s) => name.endsWith(s))) return true;
  const labels = name.split('.');
  return RESERVED_LAST_LABELS.has(labels[labels.length - 1]);
}

const CORPUS_DIRECTORIES = ['patterns', 'limits', 'fixtures'];

/**
 * The relative specifiers a module imports. The pattern is anchored to the
 * start of a line on the masked copy, so a specifier written inside a string,
 * in a test that builds fake modules out of string literals, is not read as an
 * import of a file that does not exist.
 */
function relativeImports(root, rel, tree) {
  const source = readFileSync(join(root, rel), 'utf8');
  const { masked } = tree.mask.maskSource(source);
  const out = [];
  for (const m of masked.matchAll(/^[ \t]*(?:import|export)[^\n]*?from[ \t]*['"]/gm)) {
    const quoteAt = m.index + m[0].length - 1;
    const quote = source[quoteAt];
    const end = source.indexOf(quote, quoteAt + 1);
    if (end === -1) continue;
    const target = source.slice(quoteAt + 1, end);
    if (target.startsWith('.')) out.push(target);
  }
  for (const m of masked.matchAll(/^[ \t]*import[ \t]*['"]/gm)) {
    const quoteAt = m.index + m[0].length - 1;
    const quote = source[quoteAt];
    const end = source.indexOf(quote, quoteAt + 1);
    if (end === -1) continue;
    const target = source.slice(quoteAt + 1, end);
    if (target.startsWith('.')) out.push(target);
  }
  return out;
}
const TEXT_EXTENSIONS = ['.mjs', '.js', '.json', '.yml', '.yaml', '.md', '.gitignore', ''];

function isText(rel) {
  if (rel === 'LICENSE' || rel === '.gitignore') return true;
  const dot = rel.lastIndexOf('.');
  return dot > 0 && TEXT_EXTENSIONS.includes(rel.slice(dot));
}

async function loadTree(root) {
  const importFrom = (rel) => import(pathToFileURL(join(root, rel)).href);
  const [catalogue, severity, audit, pairs, fixtures, limits, mask, yaml] = await Promise.all([
    importFrom('src/catalogue.mjs'),
    importFrom('src/severity.mjs'),
    importFrom('src/audit.mjs'),
    importFrom('tools/pairs.mjs'),
    importFrom('tools/fixtures.mjs'),
    importFrom('tools/limits.mjs'),
    importFrom('src/scan/mask.mjs'),
    importFrom('src/scan/yaml.mjs'),
  ]);
  return { catalogue, severity, audit, pairs, fixtures, limits, mask, yaml };
}

function declaredTokens(tree) {
  const out = new Set();
  for (const finding of tree.catalogue.FINDINGS) {
    for (const severity of finding.severities) out.add(`${finding.id}@${severity}`);
  }
  return out;
}

function producedTokens(root, tree) {
  const byEntry = new Map();
  const all = new Set();
  for (const entry of corpusEntries(tree)) {
    const full = join(root, entry.file);
    if (!existsSync(full)) continue;
    const tokens = tokensFor(tree.audit, full, readFileSync(full, 'utf8'));
    byEntry.set(`${entry.slug}:${entry.role}`, tokens);
    for (const token of tokens) all.add(token);
  }
  return { byEntry, all };
}

function readme(root) {
  return readFileSync(join(root, 'README.md'), 'utf8');
}

function statesOnce(text, needle) {
  return statedOnOneLine(text, (line) => line.includes(needle)).count === 1;
}

function countClaim(name, needle, value) {
  return {
    name,
    run: (ctx) => {
      const needleText = `${value(ctx)} ${needle}`;
      const { count } = statedOnOneLine(ctx.readme, (line) => line.includes(needleText));
      if (count === 1) return [];
      return [`the README should state "${needleText}" on exactly one line, and ${count} lines match`];
    },
  };
}

export const CLAIMS = [
  // ------------------------------------------------------------- catalogue
  {
    name: 'catalogue/ids-unique',
    run: ({ tree }) => {
      const seen = new Set();
      const problems = [];
      for (const finding of tree.catalogue.FINDINGS) {
        if (seen.has(finding.id)) problems.push(`${finding.id} appears more than once`);
        seen.add(finding.id);
      }
      return problems;
    },
  },
  {
    name: 'catalogue/ids-are-slugs',
    run: ({ tree }) => tree.catalogue.FINDINGS
      .filter((f) => !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(f.id))
      .map((f) => `${f.id} is not a lower case slug`),
  },
  {
    name: 'catalogue/areas-known',
    run: ({ tree }) => {
      const areas = new Set(tree.catalogue.AREAS.map((a) => a.id));
      return tree.catalogue.FINDINGS
        .filter((f) => !areas.has(f.area))
        .map((f) => `${f.id} names the area ${f.area}, which does not exist`);
    },
  },
  {
    name: 'catalogue/areas-all-used',
    run: ({ tree }) => {
      const used = new Set(tree.catalogue.FINDINGS.map((f) => f.area));
      return tree.catalogue.AREAS
        .filter((a) => !used.has(a.id))
        .map((a) => `the area ${a.id} has no findings`);
    },
  },
  {
    name: 'catalogue/severities-valid',
    run: ({ tree }) => {
      const problems = [];
      for (const finding of tree.catalogue.FINDINGS) {
        for (const severity of finding.severities) {
          if (!tree.severity.isSeverity(severity)) {
            problems.push(`${finding.id} declares the unknown severity ${severity}`);
          }
        }
      }
      return problems;
    },
  },
  {
    name: 'catalogue/severities-non-empty',
    run: ({ tree }) => tree.catalogue.FINDINGS
      .filter((f) => !Array.isArray(f.severities) || f.severities.length === 0)
      .map((f) => `${f.id} declares no severities`),
  },
  {
    name: 'catalogue/severities-worst-first',
    run: ({ tree }) => {
      const rank = tree.severity.SEVERITY_RANK;
      return tree.catalogue.FINDINGS
        .filter((f) => f.severities.some((s, i) => i > 0 && rank.get(s) > rank.get(f.severities[i - 1])))
        .map((f) => `${f.id} lists its severities out of order`);
    },
  },
  {
    name: 'catalogue/severities-unique',
    run: ({ tree }) => tree.catalogue.FINDINGS
      .filter((f) => new Set(f.severities).size !== f.severities.length)
      .map((f) => `${f.id} lists a severity twice`),
  },
  {
    name: 'catalogue/titles-unique',
    run: ({ tree }) => {
      const seen = new Map();
      const problems = [];
      for (const finding of tree.catalogue.FINDINGS) {
        if (seen.has(finding.title)) {
          problems.push(`${finding.id} and ${seen.get(finding.title)} describe the same thing`);
        }
        seen.set(finding.title, finding.id);
      }
      return problems;
    },
  },
  {
    name: 'catalogue/reasons-explain',
    run: ({ tree }) => tree.catalogue.FINDINGS
      .filter((f) => typeof f.reason !== 'string' || f.reason.length < 120)
      .map((f) => `${f.id} has a reason too short to be an explanation`),
  },
  {
    name: 'catalogue/remedies-present',
    run: ({ tree }) => tree.catalogue.FINDINGS
      .filter((f) => typeof f.remedy !== 'string' || f.remedy.length < 20)
      .map((f) => `${f.id} has no remedy`),
  },
  {
    name: 'catalogue/area-summaries-present',
    run: ({ tree }) => tree.catalogue.AREAS
      .filter((a) => typeof a.summary !== 'string' || a.summary.length < 80)
      .map((a) => `the area ${a.id} has no summary`),
  },

  // ---------------------------------------------------------------- corpus
  {
    name: 'corpus/exact-both-directions',
    run: ({ verdicts }) => verdicts.problems,
  },
  {
    name: 'corpus/every-declared-token-produced',
    run: ({ tree, produced }) => [...declaredTokens(tree)]
      .filter((token) => !produced.all.has(token))
      .sort()
      .map((token) => `${token} is declared and no artefact in the corpus produces it`),
  },
  {
    name: 'corpus/no-undeclared-token-produced',
    run: ({ tree, produced }) => {
      const declared = declaredTokens(tree);
      return [...produced.all]
        .filter((token) => !declared.has(token))
        .sort()
        .map((token) => `${token} is produced and the catalogue does not declare it`);
    },
  },
  {
    name: 'corpus/every-finding-has-an-artefact',
    run: ({ tree, produced }) => {
      const ids = new Set([...produced.all].map((t) => t.split('@')[0]));
      return tree.catalogue.FINDINGS
        .filter((f) => !ids.has(f.id))
        .map((f) => `${f.id} has no artefact behind it`);
    },
  },
  {
    // A pair that reaches nothing no other pair reaches cannot be added for the
    // look of it. The comparison is among pairs and fixtures only: a limit's
    // contrast case exists precisely to reach a finding a pair already reaches,
    // in a form the checkers can read, so counting those would make every pair
    // look redundant.
    //
    // A pair may be exempt, and then it has to say why in the manifest. There
    // is one, and it exists to declare a residual rather than to reach a new
    // finding.
    name: 'corpus/pairs-contribute-unique-token',
    run: ({ tree }) => {
      const problems = [];
      const counts = new Map();
      const contributors = [
        ...tree.pairs.PAIRS.filter((p) => !p.uniquenessExemptBecause),
        ...tree.fixtures.FIXTURES,
      ];
      for (const entry of contributors) {
        for (const token of entry.expected) {
          counts.set(token, (counts.get(token) ?? 0) + 1);
        }
      }
      for (const pair of tree.pairs.PAIRS) {
        if (pair.uniquenessExemptBecause) continue;
        const unique = pair.expected.filter((token) => counts.get(token) === 1);
        if (unique.length === 0) {
          problems.push(`the pair ${pair.slug} reaches nothing that no other pair reaches`);
        }
      }
      return problems;
    },
  },
  {
    name: 'corpus/uniqueness-exemptions-explained',
    run: ({ tree }) => tree.pairs.PAIRS
      .filter((p) => Object.prototype.hasOwnProperty.call(p, 'uniquenessExemptBecause'))
      .filter((p) => typeof p.uniquenessExemptBecause !== 'string' || p.uniquenessExemptBecause.length < 40)
      .map((p) => `the pair ${p.slug} is exempt from the uniqueness rule without saying why`),
  },
  {
    name: 'corpus/javascript-artefacts-parse',
    needs: ['parses'],
    run: ({ parses }) => parses.problems,
  },
  {
    name: 'corpus/residuals-are-produced',
    run: ({ tree, produced }) => {
      const problems = [];
      for (const pair of tree.pairs.PAIRS) {
        const actual = produced.byEntry.get(`${pair.slug}:after`) ?? [];
        for (const token of pair.residual) {
          if (!actual.includes(token)) {
            problems.push(`${pair.slug} claims the residual ${token} and its corrected side does not produce it`);
          }
        }
      }
      return problems;
    },
  },
  {
    name: 'corpus/fixture-count-equals-unreached',
    run: ({ tree }) => {
      const byPairs = new Set();
      for (const pair of tree.pairs.PAIRS) for (const token of pair.expected) byPairs.add(token);
      const unreached = [...declaredTokens(tree)].filter((t) => !byPairs.has(t));
      const fixtures = tree.fixtures.FIXTURES.length;
      if (fixtures === unreached.length) return [];
      return [`${unreached.length} declared findings are not reached by a pair and there are `
        + `${fixtures} fixtures. One per reason, and no more.`];
    },
  },
  {
    name: 'corpus/second-severity-exceptions-named',
    run: ({ tree }) => {
      const named = new Set(tree.fixtures.SECOND_SEVERITY_EXCEPTIONS);
      return tree.fixtures.FIXTURES
        .filter((f) => !named.has(f.slug) && f.secondSeverity === true)
        .map((f) => `the fixture ${f.slug} exists for a second severity and is not in the exception list`);
    },
  },
  {
    name: 'corpus/artefacts-exist',
    run: ({ root, tree }) => corpusEntries(tree)
      .filter((entry) => !existsSync(join(root, entry.file)))
      .map((entry) => `${entry.file} is named by a manifest and is not on disk`),
  },
  {
    name: 'corpus/no-orphan-artefacts',
    run: ({ root, tree, files }) => {
      const named = new Set(corpusEntries(tree).map((e) => e.file.split(/[\\/]/).join('/')));
      return files
        .filter((rel) => CORPUS_DIRECTORIES.includes(rel.split('/')[0]))
        .filter((rel) => !named.has(rel))
        .map((rel) => `${rel} is in the corpus and no manifest names it`);
    },
  },
  {
    name: 'corpus/pair-slugs-unique',
    run: ({ tree }) => {
      const seen = new Set();
      const problems = [];
      for (const pair of tree.pairs.PAIRS) {
        if (seen.has(pair.slug)) problems.push(`the pair slug ${pair.slug} appears twice`);
        seen.add(pair.slug);
      }
      return problems;
    },
  },
  {
    name: 'corpus/pair-areas-known',
    run: ({ tree }) => {
      const areas = new Set(tree.catalogue.AREAS.map((a) => a.id));
      return tree.pairs.PAIRS
        .filter((p) => !areas.has(p.area))
        .map((p) => `the pair ${p.slug} names the area ${p.area}, which does not exist`);
    },
  },
  {
    name: 'corpus/every-area-has-a-pair',
    run: ({ tree }) => {
      const covered = new Set(tree.pairs.PAIRS.map((p) => p.area));
      return tree.catalogue.AREAS
        .filter((a) => !covered.has(a.id))
        .map((a) => `the area ${a.id} has no pattern pair`);
    },
  },

  // ---------------------------------------------------------------- limits
  {
    name: 'limits/kinds-known',
    run: ({ tree }) => tree.limits.LIMITS
      .filter((l) => !tree.limits.LIMIT_KINDS.includes(l.kind))
      .map((l) => `the limit ${l.slug} declares the unknown kind ${l.kind}`),
  },
  {
    name: 'limits/slugs-unique',
    run: ({ tree }) => {
      const seen = new Set();
      const problems = [];
      for (const limit of tree.limits.LIMITS) {
        if (seen.has(limit.slug)) problems.push(`the limit slug ${limit.slug} appears twice`);
        seen.add(limit.slug);
      }
      return problems;
    },
  },
  {
    name: 'limits/hides-blind-clean',
    run: ({ tree, produced }) => tree.limits.LIMITS
      .filter((l) => l.kind === 'hides')
      .filter((l) => (produced.byEntry.get(`${l.slug}:blind`) ?? []).length > 0)
      .map((l) => `${l.slug} hides a problem and its blind case reports `
        + `${(produced.byEntry.get(`${l.slug}:blind`) ?? []).join(',')}`),
  },
  {
    // Both halves. The manifest has to claim something for the contrast case
    // and the contrast case has to actually report it, because either half on
    // its own can be satisfied without the limit being demonstrated at all.
    name: 'limits/hides-contrast-reports',
    run: ({ tree, produced }) => {
      const problems = [];
      for (const limit of tree.limits.LIMITS) {
        if (limit.kind !== 'hides') continue;
        if (limit.contrastExpected.length === 0) {
          problems.push(`${limit.slug} hides a problem and its manifest claims nothing for the contrast case`);
        }
        if ((produced.byEntry.get(`${limit.slug}:contrast`) ?? []).length === 0) {
          problems.push(`${limit.slug} hides a problem and its contrast case reports nothing, `
            + 'which proves nothing: a file with no problem in it also reports nothing');
        }
      }
      return problems;
    },
  },
  {
    name: 'limits/manufactures-blind-reports',
    run: ({ tree, produced }) => {
      const problems = [];
      for (const limit of tree.limits.LIMITS) {
        if (limit.kind !== 'manufactures') continue;
        if (limit.blindExpected.length === 0) {
          problems.push(`${limit.slug} manufactures a finding and its manifest claims nothing for the blind case`);
        }
        if ((produced.byEntry.get(`${limit.slug}:blind`) ?? []).length === 0) {
          problems.push(`${limit.slug} manufactures a finding and its blind case reports nothing`);
        }
      }
      return problems;
    },
  },
  {
    name: 'limits/manufactures-contrast-clean',
    run: ({ tree, produced }) => tree.limits.LIMITS
      .filter((l) => l.kind === 'manufactures')
      .filter((l) => (produced.byEntry.get(`${l.slug}:contrast`) ?? []).length > 0)
      .map((l) => `${l.slug} manufactures a finding and its contrast case is not clean`),
  },
  {
    name: 'limits/areas-known',
    run: ({ tree }) => {
      const areas = new Set(tree.catalogue.AREAS.map((a) => a.id));
      return tree.limits.LIMITS
        .filter((l) => !areas.has(l.area))
        .map((l) => `the limit ${l.slug} names the area ${l.area}, which does not exist`);
    },
  },
  {
    name: 'limits/details-explain',
    run: ({ tree }) => tree.limits.LIMITS
      .filter((l) => typeof l.detail !== 'string' || l.detail.length < 120)
      .map((l) => `the limit ${l.slug} has a detail too short to be an explanation`),
  },
  {
    name: 'limits/declared-tokens-are-catalogued',
    run: ({ tree }) => {
      const declared = declaredTokens(tree);
      const problems = [];
      for (const limit of tree.limits.LIMITS) {
        for (const token of [...limit.blindExpected, ...limit.contrastExpected]) {
          if (!declared.has(token)) problems.push(`the limit ${limit.slug} names ${token}, which is not catalogued`);
        }
      }
      return problems;
    },
  },
  {
    name: 'limits/both-kinds-present',
    run: ({ tree }) => {
      const kinds = new Set(tree.limits.LIMITS.map((l) => l.kind));
      return tree.limits.LIMIT_KINDS
        .filter((kind) => !kinds.has(kind))
        .map((kind) => `no limit of the kind ${kind} is declared, so the rules for it are never exercised`);
    },
  },

  // ---------------------------------------------------------------- binary
  {
    name: 'binary/exit-codes-match-derivation',
    needs: ['exitCodes'],
    run: ({ exitCodes }) => exitCodes.problems,
  },
  {
    name: 'binary/usage-exit-code',
    needs: ['usage'],
    run: ({ usage }) => usage.problems,
  },
  {
    name: 'binary/modes-agree',
    needs: ['modes'],
    run: ({ modes }) => modes.problems,
  },
  {
    name: 'entry/branch-budget',
    run: ({ entry }) => (entry.branches > BRANCH_BUDGET
      ? [`the entry point has ${entry.branches} branches and the budget is ${BRANCH_BUDGET}`]
      : []),
  },
  {
    name: 'entry/line-budget',
    run: ({ entry }) => (entry.lines > LINE_BUDGET
      ? [`the entry point is ${entry.lines} lines and the budget is ${LINE_BUDGET}`]
      : []),
  },
  {
    name: 'entry/main-module-guard',
    run: ({ root, files }) => {
      const problems = [];
      const needle = 'pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url';
      for (const rel of files) {
        if (!rel.endsWith('.mjs')) continue;
        const text = readFileSync(join(root, rel), 'utf8');
        if (!text.includes('process.argv[1]')) continue;
        if (!text.includes(needle)) {
          problems.push(`${rel} guards on the main module without resolving both sides to a real path`);
        }
      }
      return problems;
    },
  },

  // ------------------------------------------------------------------ tree
  {
    name: 'tree/no-em-or-en-dash',
    run: ({ root, files }) => {
      // The needles are built from code points so that no file on disk contains
      // the pattern this claim looks for.
      const needles = [String.fromCharCode(0x2014), String.fromCharCode(0x2013)];
      const problems = [];
      for (const rel of files) {
        if (!isText(rel)) continue;
        const text = readFileSync(join(root, rel), 'utf8');
        for (const needle of needles) {
          if (text.includes(needle)) problems.push(`${rel} contains a long dash`);
        }
      }
      return problems;
    },
  },
  {
    name: 'tree/hosts-documented',
    run: ({ root, files }) => {
      const problems = [];
      for (const rel of files) {
        if (!CORPUS_DIRECTORIES.includes(rel.split('/')[0])) continue;
        const text = readFileSync(join(root, rel), 'utf8');
        const hosts = new Set();
        for (const m of text.matchAll(/https?:\/\/([^/\s"'`)\\]+)/g)) hosts.add(m[1]);
        for (const m of text.matchAll(/"host"\s*:\s*"([^"]+)"/g)) hosts.add(m[1]);
        for (const host of hosts) {
          if (!hostIsReserved(host)) problems.push(`${rel} points at ${host}, which is not a reserved example name`);
        }
      }
      return problems;
    },
  },
  {
    name: 'tree/no-long-digit-runs',
    run: ({ root, files }) => {
      const problems = [];
      for (const rel of files) {
        if (!CORPUS_DIRECTORIES.includes(rel.split('/')[0])) continue;
        const text = readFileSync(join(root, rel), 'utf8');
        const m = /\d{13,}/.exec(text);
        if (m) problems.push(`${rel} carries a run of ${m[0].length} digits`);
      }
      return problems;
    },
  },
  {
    name: 'tree/test-files-listed',
    run: ({ root, files, testScript }) => {
      const onDisk = files.filter((rel) => rel.startsWith('test/') && rel.endsWith('.test.mjs'));
      return onDisk
        .filter((rel) => !testScript.includes(rel))
        .map((rel) => `${rel} is on disk and scripts.test does not run it`);
    },
  },
  {
    name: 'tree/listed-test-files-exist',
    run: ({ root, testScript }) => testScript
      .split(/\s+/)
      .filter((part) => part.endsWith('.test.mjs'))
      .filter((rel) => !existsSync(join(root, rel)))
      .map((rel) => `scripts.test runs ${rel}, which is not on disk`),
  },
  {
    // The corpus is excluded, and deliberately. Its artefacts are extracts of
    // other people's applications, so they import modules that do not exist
    // here and are supposed to. The claim below proves that exclusion is real
    // rather than a quiet widening of this one.
    name: 'tree/imports-resolve',
    run: ({ root, files, tree }) => {
      const problems = [];
      for (const rel of files) {
        if (!rel.endsWith('.mjs')) continue;
        if (CORPUS_DIRECTORIES.includes(rel.split('/')[0])) continue;
        for (const target of relativeImports(root, rel, tree)) {
          const resolved = resolve(dirname(join(root, rel)), target);
          if (!existsSync(resolved)) {
            problems.push(`${rel} imports ${target}, which does not resolve`);
          }
        }
      }
      return problems;
    },
  },
  {
    name: 'tree/import-exclusion-is-real',
    run: ({ root, files, tree }) => {
      const corpus = files.filter((rel) => rel.endsWith('.mjs')
        && CORPUS_DIRECTORIES.includes(rel.split('/')[0]));
      const unresolvable = corpus.some((rel) => relativeImports(root, rel, tree)
        .some((target) => !existsSync(resolve(dirname(join(root, rel)), target))));
      if (unresolvable) return [];
      return ['no corpus artefact imports anything unresolvable, so excluding the '
        + 'corpus from the import claim is untested and may be hiding a real problem'];
    },
  },
  {
    name: 'tree/imports-within-shipped-directories',
    run: ({ root, shipped, files, tree }) => {
      const problems = [];
      const shippedDirs = shipped.filter((entry) => !entry.includes('.'));
      const shippedFiles = files.filter((rel) => rel.endsWith('.mjs')
        && shippedDirs.includes(rel.split('/')[0]));
      for (const rel of shippedFiles) {
        for (const target of relativeImports(root, rel, tree)) {
          // Resolved against the importing file, not against the repository
          // root, because a specifier is relative to where it is written.
          const resolved = resolve(dirname(join(root, rel)), target);
          const top = resolved.slice(root.length + 1).split(/[\\/]/)[0];
          if (!shippedDirs.includes(top)) {
            problems.push(`${rel} imports ${target}, which is outside every shipped directory`);
          }
        }
      }
      return problems;
    },
  },
  {
    name: 'tree/lockfile-not-tracked',
    run: ({ files }) => (files.includes('package-lock.json')
      ? ['package-lock.json is tracked and this package has no dependencies to pin']
      : []),
  },

  // ------------------------------------------------------------- documents
  {
    name: 'documents/fresh',
    run: ({ stale }) => stale,
  },
  {
    name: 'documents/referenced-from-readme',
    run: ({ readme: text }) => ['docs/FINDINGS.md', 'docs/LIMITS.md']
      .filter((doc) => !text.includes(doc))
      .map((doc) => `${doc} is not linked from the README`),
  },
  {
    name: 'readme/verifying-section',
    run: ({ readme: text }) => (text.includes('## Verifying') ? [] : ['the README has no Verifying section']),
  },
  countClaim('readme/finding-count-stated-once', 'catalogued findings', ({ tree }) => tree.catalogue.FINDINGS.length),
  countClaim('readme/area-count-stated-once', 'areas', ({ tree }) => tree.catalogue.AREAS.length),
  countClaim('readme/pair-count-stated-once', 'pattern pairs', ({ tree }) => tree.pairs.PAIRS.length),
  countClaim('readme/limit-count-stated-once', 'declared limits', ({ tree }) => tree.limits.LIMITS.length),
  countClaim('readme/artefact-count-stated-once', 'corpus artefacts', ({ tree }) => corpusEntries(tree).length),
  countClaim('readme/claim-count-stated-once', 'repository assertions', () => CLAIMS.length),
  {
    name: 'readme/test-count-stated-once',
    run: ({ readme: text, testCount }) => {
      if (testCount === null) return ['the test count was not supplied to the verifier'];
      const needle = `${testCount} tests`;
      const { count } = statedOnOneLine(text, (line) => line.includes(needle));
      if (count === 1) return [];
      return [`the README should state "${needle}" on exactly one line, and ${count} lines match`];
    },
  },

  // --------------------------------------------------------- engines and CI
  {
    name: 'engines/floor-exact',
    run: ({ engines }) => {
      if (!/^>=\d+\.\d+\.\d+$/.test(engines)) {
        return [`engines.node is ${engines}, and a floor has to name all three `
          + 'components with an operator, because setup-node resolves a bare major to '
          + 'the newest release of that line'];
      }
      return [];
    },
  },
  {
    // Read through this repository's own YAML reader rather than by searching
    // the file for the version string. A search is satisfied by any step that
    // happens to pin the same version, so the matrix itself could stop naming
    // the floor while the claim stayed green.
    name: 'ci/matrix-includes-floor',
    run: ({ ci, engines, tree }) => {
      const floor = engines.replace('>=', '');
      const parsed = tree.yaml.parseYaml(ci);
      const jobs = parsed.value && parsed.value.jobs ? parsed.value.jobs : {};
      const matrices = Object.entries(jobs)
        .map(([name, job]) => [name, job && job.strategy && job.strategy.matrix
          ? job.strategy.matrix.node : null])
        .filter(([, versions]) => Array.isArray(versions));
      if (matrices.length === 0) return ['no CI job runs the suite over a matrix of Node versions'];
      const problems = [];
      for (const [name, versions] of matrices) {
        if (!versions.map(String).includes(floor)) {
          problems.push(`the matrix of job ${name} does not name the engines floor ${floor}`);
        }
        for (const version of versions) {
          if (!/^\d+\.\d+\.\d+$/.test(String(version))) {
            problems.push(`the matrix of job ${name} names ${version}, and a bare major `
              + 'resolves to the newest release of that line, so it is not a tested promise');
          }
        }
      }
      return problems;
    },
  },
  {
    name: 'ci/engine-strict-jobs-present',
    run: ({ ci }) => {
      const problems = [];
      if (!ci.includes('--engine-strict')) problems.push('no CI job installs with --engine-strict');
      if (!ci.includes('engines-refusal.mjs')) {
        problems.push('no CI job tests that the engines floor actually refuses, so the job '
          + 'that installs at the floor proves nothing');
      }
      return problems;
    },
  },
  {
    name: 'ci/verifier-job-present',
    run: ({ ci }) => (ci.includes('npm run verify') || ci.includes('tools/verify.mjs')
      ? [] : ['no CI job runs the verifier']),
  },
  {
    name: 'ci/documents-job-present',
    run: ({ ci }) => (ci.includes('gen-docs.mjs --check') || ci.includes('docs:check')
      ? [] : ['no CI job checks that the generated documents are fresh']),
  },
  {
    // This repository reads YAML with a reader that handles a subset, so its own
    // workflow has to be written in that subset. Otherwise the claim above
    // would be reading a half parsed document and would not know it.
    name: 'ci/readable-by-our-own-reader',
    run: ({ ci, tree }) => {
      const parsed = tree.yaml.parseYaml(ci);
      return parsed.unread.map((item) => `line ${item.line} of the workflow is `
        + `${item.reason}, which this repository's own reader cannot read`);
    },
  },
  {
    name: 'ci/no-redirected-npm-run',
    run: ({ ci }) => {
      const problems = [];
      for (const line of ci.split('\n')) {
        const text = line.trim();
        if (text.startsWith('#')) continue;
        if (/npm\s+run\b[^|]*>/.test(text)) {
          problems.push('a CI step redirects the output of an npm run, which captures npm\'s own banner');
        }
      }
      return problems;
    },
  },

  // -------------------------------------------------------------- meta
  {
    name: 'meta/claim-names-unique',
    run: () => {
      const seen = new Set();
      const problems = [];
      for (const claim of CLAIMS) {
        if (seen.has(claim.name)) problems.push(`the claim ${claim.name} appears twice`);
        seen.add(claim.name);
      }
      return problems;
    },
  },
  {
    name: 'meta/severity-comparison-non-vacuous',
    run: ({ tree, produced }) => {
      // The declared-token claim passes when every declared token is produced.
      // Run the same comparison over a token nothing can produce: it has to
      // fail, or the passing version is passing because the loop never runs.
      const invented = 'invented-finding-id@high';
      const declared = new Set([...declaredTokens(tree), invented]);
      const missing = [...declared].filter((token) => !produced.all.has(token));
      if (missing.length === 1 && missing[0] === invented) return [];
      return ['the declared token comparison does not fail for an invented finding id, '
        + 'so its passing form proves nothing'];
    },
  },
];

export const CLAIM_COUNT = CLAIMS.length;

/**
 * The exit codes that are about the command line rather than about findings. A
 * usage error has to be distinguishable from a clean run, or a typo in a
 * scheduled job reads as a site with nothing wrong with it.
 */
function checkUsage(root) {
  const binary = join(root, 'bin', 'site-monitoring.mjs');
  const problems = [];
  const cases = [
    { args: [], expected: 64, what: 'no path' },
    { args: ['--nonsense', 'patterns'], expected: 64, what: 'an unknown option' },
    { args: ['does-not-exist.json'], expected: 64, what: 'a path that does not exist' },
    { args: ['--help'], expected: 0, what: 'the help text' },
  ];
  for (const item of cases) {
    const result = runBinary(binary, item.args, root);
    if (result.status !== item.expected) {
      problems.push(`${item.what} exits ${result.status}, expected ${item.expected}`);
    }
  }
  return { problems, runs: cases.length };
}

/**
 * A tool with two modes has to make the same assertions in both. The text and
 * the JSON are compared on the thing that matters: the set of findings and the
 * exit code.
 */
function checkModesAgree(root, tree) {
  const binary = join(root, 'bin', 'site-monitoring.mjs');
  const problems = [];
  let runs = 0;
  for (const entry of corpusEntries(tree)) {
    const text = runBinary(binary, [entry.file], root);
    const json = runBinary(binary, [entry.file, '--json'], root);
    runs += 2;
    if (text.status !== json.status) {
      problems.push(`${entry.file}: text mode exits ${text.status} and JSON mode exits ${json.status}`);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(json.stdout);
    } catch {
      problems.push(`${entry.file}: JSON mode did not produce JSON`);
      continue;
    }
    const fromJson = parsed.files.flatMap((f) => f.findings.map((x) => `${x.id}@${x.severity}`)).sort();
    const fromText = [...text.stdout.matchAll(/^\s{2}(high|medium|low)\s+([a-z0-9-]+)/gm)]
      .map((m) => `${m[2]}@${m[1]}`).sort();
    if (fromJson.join(',') !== fromText.join(',')) {
      problems.push(`${entry.file}: the two modes report different findings`);
    }
  }
  return { problems, runs };
}

/**
 * Builds the context every claim reads. `testCount` is supplied by the caller:
 * the command line spawns the counter, and the suite takes it from the README,
 * so the verifier is never the thing that runs the suite that runs it.
 */
export async function buildContext(root, { testCount = null, needs = null } = {}) {
  const tree = await loadTree(root);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  // The three parts that spawn the real binary are built only when a claim that
  // reads them is going to run. Running the whole corpus through the binary
  // four hundred times is right for the verifier and wrong for a perturbation
  // test that only needs one claim answered.
  const wanted = (name) => needs === null || needs.has(name);
  const [verdicts, entry, stale, exitCodes] = await Promise.all([
    auditVerdicts(root),
    measureEntry(root),
    staleDocuments(root),
    wanted('exitCodes') ? checkExitCodes(root) : Promise.resolve({ problems: [], runs: 0 }),
  ]);
  const usage = wanted('usage') ? checkUsage(root) : { problems: [], runs: 0 };
  const modes = wanted('modes') ? checkModesAgree(root, tree) : { problems: [], runs: 0 };
  const parses = wanted('parses') ? checkArtefactsParse(root, tree) : { problems: [], runs: 0 };
  return {
    root,
    tree,
    files: trackedFiles(root),
    readme: readme(root),
    engines: pkg.engines.node,
    shipped: pkg.files,
    testScript: pkg.scripts.test,
    ci: readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8'),
    produced: producedTokens(root, tree),
    verdicts,
    entry,
    stale,
    exitCodes,
    usage,
    modes,
    parses,
    testCount,
  };
}

/**
 * Runs every claim. A tree whose modules will not load fails every claim with
 * the load error rather than taking the verifier down with it.
 */
export async function verify(root, options = {}) {
  const selected = options.only
    ? CLAIMS.filter((claim) => options.only.includes(claim.name))
    : CLAIMS;
  if (options.only && selected.length !== options.only.length) {
    const missing = options.only.filter((name) => !CLAIMS.some((c) => c.name === name));
    throw new Error(`no claim named ${missing.join(', ')}`);
  }
  const needs = new Set(selected.flatMap((claim) => claim.needs ?? []));
  let context;
  try {
    context = await buildContext(root, { ...options, needs });
  } catch (cause) {
    const reason = cause && cause.message ? cause.message : String(cause);
    return selected.map((claim) => ({ name: claim.name, problems: [`the tree would not load: ${reason}`] }));
  }
  const results = [];
  for (const claim of selected) {
    let problems;
    try {
      problems = claim.run(context) ?? [];
    } catch (cause) {
      problems = [`the claim threw: ${cause && cause.message ? cause.message : String(cause)}`];
    }
    results.push({ name: claim.name, problems });
  }
  return results;
}

/**
 * Every JavaScript artefact in the corpus has to be valid JavaScript. A
 * syntax checked example is not a checked example, which is why the corpus pass
 * exists as well, but an artefact that does not parse at all is a pattern
 * nobody can copy.
 */
function checkArtefactsParse(root, tree) {
  const problems = [];
  let runs = 0;
  for (const entry of corpusEntries(tree)) {
    if (!/\.(mjs|js|cjs)$/.test(entry.file)) continue;
    const result = spawnSync(process.execPath, ['--check', entry.file], { cwd: root, encoding: 'utf8' });
    runs += 1;
    if (result.status !== 0) {
      problems.push(`${entry.file} is not valid JavaScript: ${(result.stderr ?? '').split('\n')[0]}`);
    }
  }
  return { problems, runs };
}

/** One named claim, for the perturbation suite. */
export async function verifyOne(root, name, options = {}) {
  const results = await verify(root, { ...options, only: [name] });
  const found = results.find((r) => r.name === name);
  if (!found) throw new Error(`no claim named ${name}`);
  return found;
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
  const { countTests } = await import('./count-tests.mjs');
  let testCount = null;
  const counts = await countTests(root);
  if (counts.fail !== 0) {
    process.stderr.write(`the suite is not green: ${counts.fail} failing. `
      + 'No count is quoted from a red run.\n');
    process.exitCode = 1;
  } else {
    testCount = counts.total;
  }
  const results = await verify(root, { testCount });
  let failed = 0;
  for (const result of results) {
    if (result.problems.length === 0) continue;
    failed += 1;
    process.stderr.write(`${result.name}\n`);
    for (const problem of result.problems) process.stderr.write(`    ${problem}\n`);
  }
  process.stdout.write(`${results.length - failed} of ${results.length} claims hold\n`);
  if (failed > 0) process.exitCode = 1;
}
