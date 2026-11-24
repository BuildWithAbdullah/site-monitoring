// Severity is a closed set with a fixed order, and the exit code of the binary
// is derived from the worst severity present rather than from a list kept
// anywhere else.

export const SEVERITIES = ['high', 'medium', 'low'];

export const SEVERITY_RANK = new Map(SEVERITIES.map((s, i) => [s, SEVERITIES.length - i]));

export function isSeverity(value) {
  return SEVERITIES.includes(value);
}

export function worstSeverity(severities) {
  let worst = null;
  for (const s of severities) {
    if (!isSeverity(s)) throw new Error(`unknown severity: ${String(s)}`);
    if (worst === null || SEVERITY_RANK.get(s) > SEVERITY_RANK.get(worst)) worst = s;
  }
  return worst;
}

// 2 when anything high is present, 1 when anything else is, 0 when the set is
// empty. tools/exit-codes.mjs derives its expectations from this function and
// the corpus manifest, so the table lives in one place.
export function exitCodeFor(severities) {
  const worst = worstSeverity(severities);
  if (worst === null) return 0;
  return worst === 'high' ? 2 : 1;
}

export function tokenFor(id, severity) {
  if (!isSeverity(severity)) throw new Error(`unknown severity: ${String(severity)}`);
  return `${id}@${severity}`;
}

export function sortTokens(tokens) {
  return [...tokens].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
