// The perturbation suite.
//
// Every claim in tools/verify.mjs is proved non-vacuous individually: the tree
// is copied, one named change is made to the copy, and the single claim that
// change should break is run against both. It must pass on the unchanged copy
// and fail on the perturbed one. A claim nothing can break is a claim that is
// not checking anything.
//
// This is also the only thing that can catch a verifier reading its own
// statically imported modules instead of the tree it was given. Against the
// repository itself such a verifier answers correctly on every claim; against a
// copy with an edited manifest it still answers correctly, which is the bug.

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

// Filter on the basename. A substring test against the path excludes
// `.github` and `.gitignore` along with `.git`, which silently removes the
// workflow file and the ignore rules from every copied tree.
const SKIP = new Set(['.git', 'node_modules']);

export function copyTree(root) {
  const dir = mkdtempSync(join(tmpdir(), 'site-monitoring-perturb-'));
  const target = join(dir, 'tree');
  cpSync(root, target, {
    recursive: true,
    filter: (source) => !SKIP.has(basename(source)),
  });
  return target;
}

export function discard(target) {
  rmSync(join(target, '..'), { recursive: true, force: true });
}

function edit(root, rel, from, to) {
  const path = join(root, rel);
  const text = readFileSync(path, 'utf8');
  if (!text.includes(from)) {
    throw new Error(`perturbation anchor not found in ${rel}: ${from.slice(0, 60)}`);
  }
  writeFileSync(path, text.replace(from, to));
}

function append(root, rel, text) {
  const path = join(root, rel);
  writeFileSync(path, readFileSync(path, 'utf8') + text);
}

export const PERTURBATIONS = [
  {
    name: 'a finding id is duplicated',
    claim: 'catalogue/ids-unique',
    apply: (root) => edit(root, 'src/catalogue.mjs',
      "    id: 'health-swallows-dependency-error',",
      "    id: 'health-ignores-dependencies',"),
  },
  {
    name: 'a finding names an area that does not exist',
    claim: 'catalogue/areas-known',
    apply: (root) => edit(root, 'src/catalogue.mjs',
      "    area: 'synthetic-journeys',\n    severities: ['high'],\n    title: 'The journey navigates and asserts nothing',",
      "    area: 'synthetic-journeyz',\n    severities: ['high'],\n    title: 'The journey navigates and asserts nothing',"),
  },
  {
    name: 'a finding declares a severity nothing produces',
    claim: 'corpus/every-declared-token-produced',
    apply: (root) => edit(root, 'src/catalogue.mjs',
      "    id: 'check-no-timeout',\n    area: 'check-configuration',\n    severities: ['high'],",
      "    id: 'check-no-timeout',\n    area: 'check-configuration',\n    severities: ['high', 'low'],"),
  },
  {
    name: 'a finding is added to the catalogue with no artefact behind it',
    claim: 'corpus/every-finding-has-an-artefact',
    apply: (root) => edit(root, 'src/catalogue.mjs',
      'export const FINDINGS_BY_ID',
      `FINDINGS.push({
  id: 'invented-finding-with-no-artefact',
  area: 'health-and-readiness',
  severities: ['low'],
  title: 'Invented',
  reason: 'A reason long enough to pass the length claim, written here only so that the perturbation changes exactly one thing about the tree under test.',
  remedy: 'None, because nothing raises it.',
});

export const FINDINGS_BY_ID`),
  },
  {
    name: 'a pair manifest drops a token the run still produces',
    claim: 'corpus/exact-both-directions',
    apply: (root) => edit(root, 'tools/pairs.mjs',
      "    expected: ['health-no-dependency-timeout@medium', 'health-writes-on-every-call@low'],",
      "    expected: ['health-no-dependency-timeout@medium'],"),
  },
  {
    name: 'a pair is given an expected set that nothing in it reaches uniquely',
    claim: 'corpus/pairs-contribute-unique-token',
    apply: (root) => edit(root, 'tools/pairs.mjs',
      "    slug: 'health-leaks-dsn',\n    area: 'health-and-readiness',\n    before: 'health-leaks-dsn.before.mjs',\n    after: 'health-leaks-dsn.after.mjs',\n    expected: ['health-leaks-internal-detail@high'],",
      "    slug: 'health-leaks-dsn',\n    area: 'health-and-readiness',\n    before: 'health-swallowed-error.before.mjs',\n    after: 'health-leaks-dsn.after.mjs',\n    expected: ['health-swallows-dependency-error@high', 'health-leaks-internal-detail@medium'],"),
  },
  {
    name: 'a residual is claimed that the corrected side does not produce',
    claim: 'corpus/residuals-are-produced',
    apply: (root) => edit(root, 'tools/pairs.mjs',
      "    expected: ['health-ignores-dependencies@high'],\n    residual: [],",
      "    expected: ['health-ignores-dependencies@high'],\n    residual: ['health-ignores-dependencies@high'],"),
  },
  {
    name: 'a fixture is added for a reason a pair already reaches',
    claim: 'corpus/fixture-count-equals-unreached',
    apply: (root) => edit(root, 'tools/fixtures.mjs',
      'export const FIXTURES = [];',
      "export const FIXTURES = [{ slug: 'spare', file: 'spare.json', expected: [] }];"),
  },
  {
    name: 'an artefact is left in the corpus that no manifest names',
    claim: 'corpus/no-orphan-artefacts',
    apply: (root) => writeFileSync(join(root, 'patterns', 'orphan.before.json'), '{}\n'),
  },
  {
    name: 'a limit that hides is relabelled as one that manufactures',
    claim: 'limits/manufactures-blind-reports',
    apply: (root) => edit(root, 'tools/limits.mjs',
      "    slug: 'dynamic-code',\n    kind: 'hides',",
      "    slug: 'dynamic-code',\n    kind: 'manufactures',"),
  },
  {
    name: 'a limit that hides has its contrast case claimed as clean',
    claim: 'limits/hides-contrast-reports',
    apply: (root) => edit(root, 'tools/limits.mjs',
      "    blindExpected: [],\n    contrastExpected: ['health-ignores-dependencies@high'],",
      "    blindExpected: [],\n    contrastExpected: [],"),
  },
  {
    name: 'a limit that manufactures has its blind case claimed as clean',
    claim: 'limits/manufactures-blind-reports',
    apply: (root) => edit(root, 'tools/limits.mjs',
      "    blindExpected: ['health-writes-on-every-call@low'],\n    contrastExpected: [],",
      "    blindExpected: [],\n    contrastExpected: [],"),
  },
  {
    name: 'the generated limits document is edited by hand',
    claim: 'documents/fresh',
    apply: (root) => append(root, 'docs/LIMITS.md', '\nAn edit nobody generated.\n'),
  },
  {
    name: 'the README states a test count that is not the measured one',
    claim: 'readme/test-count-stated-once',
    apply: (root) => {
      const text = readFileSync(join(root, 'README.md'), 'utf8');
      const m = /(\d+) tests/.exec(text);
      if (!m) throw new Error('no test count in the README');
      writeFileSync(join(root, 'README.md'), text.replace(`${m[1]} tests`, `${Number(m[1]) + 1} tests`));
    },
  },
  {
    name: 'a stated count appears on two lines',
    claim: 'readme/finding-count-stated-once',
    apply: (root) => {
      const text = readFileSync(join(root, 'README.md'), 'utf8');
      const m = /(\d+) catalogued findings/.exec(text);
      if (!m) throw new Error('no finding count in the README');
      writeFileSync(join(root, 'README.md'), `${text}\n\nAlso ${m[0]}.\n`);
    },
  },
  {
    name: 'the engines floor is loosened to a bare major version',
    claim: 'engines/floor-exact',
    apply: (root) => edit(root, 'package.json', '">=20.18.1"', '">=20"'),
  },
  {
    name: 'the CI matrix stops naming the engines floor',
    claim: 'ci/matrix-includes-floor',
    apply: (root) => edit(root, '.github/workflows/ci.yml',
      "          - '20.18.1'\n", "          - '21.7.3'\n"),
  },
  {
    name: 'a matrix entry is loosened to a bare major version',
    claim: 'ci/matrix-includes-floor',
    apply: (root) => edit(root, '.github/workflows/ci.yml',
      "          - '22.23.5'\n", "          - '22'\n"),
  },
  {
    name: 'the contrast case of a limit that hides is replaced with a clean file',
    claim: 'limits/hides-contrast-reports',
    apply: (root) => writeFileSync(
      join(root, 'limits', 'dynamic-code.contrast.mjs'),
      'export function add(a, b) {\n  return a + b;\n}\n',
    ),
  },
  {
    name: 'the blind case of a limit that manufactures is replaced with a clean file',
    claim: 'limits/manufactures-blind-reports',
    apply: (root) => writeFileSync(
      join(root, 'limits', 'write-probe-by-method-name.blind.mjs'),
      'export function add(a, b) {\n  return a + b;\n}\n',
    ),
  },
  {
    name: 'a decision is moved back into the entry point',
    claim: 'entry/branch-budget',
    apply: (root) => edit(root, 'bin/site-monitoring.mjs',
      'if (invokedDirectly) {',
      'if (invokedDirectly && process.argv.length > 1) {'),
  },
  {
    name: 'a test file is added on disk without being listed in scripts.test',
    claim: 'tree/test-files-listed',
    apply: (root) => writeFileSync(join(root, 'test', 'unlisted.test.mjs'),
      "import test from 'node:test';\ntest('unlisted', () => {});\n"),
  },
  {
    name: 'an em dash is introduced into a source file',
    claim: 'tree/no-em-or-en-dash',
    apply: (root) => append(root, 'src/severity.mjs',
      `\n// ${String.fromCharCode(0x2014)}\n`),
  },
  {
    name: 'an artefact is pointed at a host that is not a documented example host',
    claim: 'tree/hosts-documented',
    apply: (root) => edit(root, 'patterns/checks-minimal.after.json',
      'https://shop.example.com/', 'https://shop.acmeretail.co/'),
  },
  {
    name: 'an artefact is given a thirteen digit number',
    claim: 'tree/no-long-digit-runs',
    apply: (root) => edit(root, 'patterns/alerts-flapping.after.json',
      '"id": "home-down"', '"id": "home-down-1234567890123"'),
  },
  {
    name: 'the command line stops deriving its exit code from the findings',
    claim: 'binary/exit-codes-match-derivation',
    apply: (root) => edit(root, 'src/cli.mjs',
      '  return exitCodeFor(results.flatMap((r) => r.findings.map((f) => f.severity)));',
      '  return 0;'),
  },
];

export const PERTURBATIONS_BY_CLAIM = new Map();
for (const item of PERTURBATIONS) {
  if (!PERTURBATIONS_BY_CLAIM.has(item.claim)) PERTURBATIONS_BY_CLAIM.set(item.claim, []);
  PERTURBATIONS_BY_CLAIM.get(item.claim).push(item);
}
