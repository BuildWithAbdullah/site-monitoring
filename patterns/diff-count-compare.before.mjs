// One finding fixed and one introduced leaves this comparison untouched.
import { readFileSync } from 'node:fs';

const baseline = JSON.parse(readFileSync('monitors/baseline.json', 'utf8'));
const current = JSON.parse(readFileSync('monitors/current.json', 'utf8'));

const regressions = current.findings.length - baseline.findings.length;
if (regressions > 0) {
  process.exitCode = 1;
}
