// The first time anybody reformats a file, every finding in it is both new and
// resolved, and the diff stops being read.
import { readFileSync } from 'node:fs';

const keyOf = (f) => `${f.id}:${f.file}:${f.line}`;

const baseline = JSON.parse(readFileSync('monitors/baseline.json', 'utf8'));
const current = JSON.parse(readFileSync('monitors/current.json', 'utf8'));

const before = new Set(baseline.findings.map(keyOf));
const now = new Set(current.findings.map(keyOf));

const regressions = current.findings.filter((f) => !before.has(keyOf(f)));
const resolved = baseline.findings.filter((f) => !now.has(keyOf(f)));

process.stdout.write(`${regressions.length} new, ${resolved.length} gone\n`);
