// The committed baseline is read first. The new one is written only once the
// difference has been looked at and accepted.
import { readFileSync, writeFileSync } from 'node:fs';
import { auditEverything } from './audit.mjs';

const keyOf = (f) => `${f.id}@${f.severity}|${f.file}|${f.excerpt}`;

const baseline = JSON.parse(readFileSync('monitors/baseline.json', 'utf8'));
const current = auditEverything();

const before = new Set(baseline.findings.map(keyOf));
const now = new Set(current.findings.map(keyOf));

const regressions = current.findings.filter((f) => !before.has(keyOf(f)));
const resolved = baseline.findings.filter((f) => !now.has(keyOf(f)));

process.stdout.write(`${regressions.length} new, ${resolved.length} gone\n`);

if (regressions.length > 0) {
  process.exitCode = 1;
} else if (process.argv.includes('--accept')) {
  writeFileSync('monitors/baseline.json', JSON.stringify(current, null, 2));
}
