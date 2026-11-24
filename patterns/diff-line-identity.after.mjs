// Keyed on the finding, the file and an excerpt, none of which moves when the
// lines above it do, and a regression fails the run.
import { readFileSync } from 'node:fs';

const keyOf = (f) => `${f.id}@${f.severity}|${f.file}|${f.excerpt}`;

const baseline = JSON.parse(readFileSync('monitors/baseline.json', 'utf8'));
const current = JSON.parse(readFileSync('monitors/current.json', 'utf8'));

const before = new Set(baseline.findings.map(keyOf));
const now = new Set(current.findings.map(keyOf));

const regressions = current.findings.filter((f) => !before.has(keyOf(f)));
const resolved = baseline.findings.filter((f) => !now.has(keyOf(f)));

process.stdout.write(`${regressions.length} new, ${resolved.length} gone\n`);

if (regressions.length > 0) {
  process.exitCode = 1;
}
