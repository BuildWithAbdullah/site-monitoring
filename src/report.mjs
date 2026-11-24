// Output. Two modes, and both make the same assertions: the same findings, the
// same counts and the same exit code. A mode that reports less than the other
// is a mode somebody will trust by mistake.

import { SEVERITIES, SEVERITY_RANK, exitCodeFor } from './severity.mjs';
import { FINDINGS_BY_ID } from './catalogue.mjs';

function bySeverityThenId(a, b) {
  const rank = SEVERITY_RANK.get(b.severity) - SEVERITY_RANK.get(a.severity);
  if (rank !== 0) return rank;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return (a.line ?? 0) - (b.line ?? 0);
}

export function summarise(results) {
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  let total = 0;
  for (const result of results) {
    for (const f of result.findings) {
      counts[f.severity] += 1;
      total += 1;
    }
  }
  const audited = results.filter((r) => r.kind !== null).length;
  return { total, counts, audited, files: results.length };
}

export function renderText(results) {
  const lines = [];
  for (const result of results) {
    if (result.kind === null) {
      lines.push(`${result.path}: skipped (${result.note})`);
      continue;
    }
    if (result.findings.length === 0) {
      lines.push(`${result.path} [${result.kind}]: clean`);
      continue;
    }
    lines.push(`${result.path} [${result.kind}]:`);
    for (const f of [...result.findings].sort(bySeverityThenId)) {
      const entry = FINDINGS_BY_ID.get(f.id);
      const where = f.line === null ? '' : ` line ${f.line}`;
      lines.push(`  ${f.severity.padEnd(6)} ${f.id}${where}`);
      lines.push(`         ${entry.title}`);
      if (f.detail) lines.push(`         ${f.detail}`);
    }
  }
  const summary = summarise(results);
  lines.push('');
  lines.push(`${summary.total} findings in ${summary.audited} audited files of ${summary.files}: `
    + SEVERITIES.map((s) => `${summary.counts[s]} ${s}`).join(', '));
  return lines.join('\n');
}

export function renderJson(results) {
  const summary = summarise(results);
  return JSON.stringify({
    summary,
    exitCode: exitCodeFor(results.flatMap((r) => r.findings.map((f) => f.severity))),
    files: results.map((result) => ({
      path: result.path,
      kind: result.kind,
      note: result.note,
      findings: [...result.findings].sort(bySeverityThenId).map((f) => ({
        id: f.id,
        severity: f.severity,
        area: f.area,
        line: f.line,
        detail: f.detail,
        title: FINDINGS_BY_ID.get(f.id).title,
      })),
    })),
  }, null, 2);
}
