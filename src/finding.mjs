import { FINDINGS_BY_ID } from './catalogue.mjs';
import { isSeverity } from './severity.mjs';

/**
 * Every finding a checker emits goes through here, so a finding that is not in
 * the catalogue, or is emitted at a severity the catalogue does not declare for
 * it, cannot escape a checker at all.
 */
export function finding(id, severity, line, detail) {
  const entry = FINDINGS_BY_ID.get(id);
  if (!entry) throw new Error(`finding not in the catalogue: ${id}`);
  if (!isSeverity(severity)) throw new Error(`unknown severity for ${id}: ${String(severity)}`);
  if (!entry.severities.includes(severity)) {
    throw new Error(`${id} is not declared at severity ${severity}`);
  }
  return {
    id,
    severity,
    area: entry.area,
    line: typeof line === 'number' && line > 0 ? line : null,
    detail: typeof detail === 'string' ? detail : '',
  };
}

/** One finding per id and severity, keeping the first line seen. */
export function dedupe(findings) {
  const seen = new Map();
  for (const f of findings) {
    const key = `${f.id}@${f.severity}`;
    if (!seen.has(key)) seen.set(key, f);
  }
  return [...seen.values()];
}
