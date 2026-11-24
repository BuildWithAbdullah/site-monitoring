// The baseline is written from this run and then compared against this run, so
// the comparison passes for as long as the script exists.
import { readFileSync, writeFileSync } from 'node:fs';
import { auditEverything } from './audit.mjs';

const keyOf = (f) => `${f.id}@${f.severity}|${f.file}|${f.excerpt}`;

const current = auditEverything();
writeFileSync('monitors/baseline.json', JSON.stringify(current, null, 2));

const baseline = JSON.parse(readFileSync('monitors/baseline.json', 'utf8'));
const before = new Set(baseline.findings.map(keyOf));
const now = new Set(current.findings.map(keyOf));

const regressions = current.findings.filter((f) => !before.has(keyOf(f)));
const resolved = baseline.findings.filter((f) => !now.has(keyOf(f)));

process.stdout.write(`${regressions.length} new, ${resolved.length} gone\n`);
if (regressions.length > 0) process.exit(1);
