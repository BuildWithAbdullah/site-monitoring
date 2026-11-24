// Reading monitoring configuration.
//
// Three document shapes are understood, and each is recognised by its top level
// keys rather than by its filename, because the same document is called twelve
// different things by twelve different tools. A document matching none of them
// is not audited, which is a declared limit with a pair of artefacts behind it.

export const SHAPES = ['checks', 'alerts', 'baseline'];

export function classify(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return 'unknown';
  if (Array.isArray(value.checks)) return 'checks';
  if (Array.isArray(value.alerts)) return 'alerts';
  if (Array.isArray(value.findings)) return 'baseline';
  return 'unknown';
}

export function parseConf(text) {
  let value;
  try {
    // A leading byte order mark is what a file written by a Windows editor
    // looks like, and JSON.parse refuses it. Reporting such a document as
    // unreadable is a refusal nobody can act on.
    value = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return { ok: true, value, shape: classify(value) };
}

// Durations are read from a key whose name carries its unit. A bare `interval`
// is not read at all: guessing between seconds and milliseconds silently
// changes every comparison in area B by three orders of magnitude, and a wrong
// answer stated confidently is worse than a declared blind spot.
const UNITS = [
  { suffix: 'Ms', factor: 1 },
  { suffix: 'Millis', factor: 1 },
  { suffix: 'Seconds', factor: 1000 },
  { suffix: 'Secs', factor: 1000 },
  { suffix: 'Minutes', factor: 60000 },
  { suffix: 'Mins', factor: 60000 },
  { suffix: 'Hours', factor: 3600000 },
  { suffix: 'Days', factor: 86400000 },
];

/**
 * The duration in milliseconds declared by any of the given base names, or null
 * when none of them appears with a unit suffix.
 */
export function durationMs(object, bases) {
  if (object === null || typeof object !== 'object') return null;
  for (const base of bases) {
    for (const { suffix, factor } of UNITS) {
      const key = base + suffix;
      const raw = object[key];
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        return { key, ms: raw * factor };
      }
    }
  }
  return null;
}

/** True when a base name is present with no recognised unit suffix. */
export function bareDurationKeys(object, bases) {
  if (object === null || typeof object !== 'object') return [];
  const out = [];
  for (const base of bases) {
    if (Object.prototype.hasOwnProperty.call(object, base)) out.push(base);
  }
  return out;
}

/**
 * A list, from either a list or a single value. A document that writes one
 * value where the schema allows several is extremely common, and reading it as
 * an empty list means every rule about that field silently does not apply. A
 * check declaring `expectStatus: 301` was accepted as asserting nothing.
 */
export function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  if (typeof value === 'object') return [value];
  return [value];
}

export function hostOf(url) {
  if (typeof url !== 'string') return null;
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]+)/.exec(url);
  if (!m) return null;
  return { scheme: m[1].toLowerCase(), host: m[2].toLowerCase() };
}
