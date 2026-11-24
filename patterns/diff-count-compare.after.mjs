// Two sets, compared in both directions.
import { readFileSync } from 'node:fs';

const keyOf = (f) => `${f.id}@${f.severity}|${f.file}|${f.excerpt}`;

const baseline = JSON.parse(readFileSync('monitors/baseline.json', 'utf8'));
const current = JSON.parse(readFileSync('monitors/current.json', 'utf8'));

const before = new Set(baseline.findings.map(keyOf));
const now = new Set(current.findings.map(keyOf));

const regressions = [...now].filter((key) => !before.has(key));
const resolved = [...before].filter((key) => !now.has(key));

for (const key of regressions) process.stdout.write(`new ${key}\n`);
for (const key of resolved) process.stdout.write(`gone ${key}\n`);

if (regressions.length > 0) {
  process.exitCode = 1;
}
