// A small reader for JavaScript source.
//
// There is no parser here and no dependency. Every function takes a prepared
// document, whose `masked` copy is what gets searched and whose `source` is
// what gets read when a check needs a value. The limits of reading JavaScript
// this way are declared in docs/LIMITS.md and each one has a pair of artefacts
// in limits/ proving it is real.

import { maskSource, readStringAt, stringLiterals, lineOf } from './mask.mjs';

export function prepare(source) {
  const { masked, literals } = maskSource(source);
  return { source, masked, literals };
}

export function lineAt(doc, offset) {
  return lineOf(doc.source, offset);
}

/** Every match of `regex` against the masked copy. `regex` must be global. */
export function matches(doc, regex) {
  if (!regex.global) throw new Error('matches() needs a global regex');
  const out = [];
  regex.lastIndex = 0;
  let m;
  while ((m = regex.exec(doc.masked)) !== null) {
    out.push({ match: m[0], groups: m.slice(1), index: m.index });
    if (m.index === regex.lastIndex) regex.lastIndex += 1;
  }
  return out;
}

/**
 * The range of the balanced bracket pair that opens at `openIndex`, as
 * { start, end } with start just after the opener and end at the closer.
 * Returns null when nothing closes it.
 */
export function balancedRange(doc, openIndex) {
  const open = doc.masked[openIndex];
  const close = open === '(' ? ')' : open === '{' ? '}' : open === '[' ? ']' : null;
  if (close === null) return null;
  let depth = 0;
  for (let i = openIndex; i < doc.masked.length; i += 1) {
    const ch = doc.masked[i];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return { start: openIndex + 1, end: i };
    }
  }
  return null;
}

/** The first index at or after `from` holding `ch`, or -1. */
export function indexOfChar(doc, ch, from) {
  return doc.masked.indexOf(ch, from);
}

const CALL = /([A-Za-z_$][A-Za-z0-9_$]*(?:\s*\.\s*[A-Za-z_$][A-Za-z0-9_$]*)*)\s*\(/g;

// A bare keyword followed by a parenthesis is not a call, and neither is the
// name in a function or class declaration. Without this the scanner reports
// `catch` and the name of every declared function as called.
const NOT_CALLEES = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function',
  'async', 'await', 'new', 'delete', 'void', 'do', 'else', 'class', 'in', 'of',
  'yield', 'instanceof', 'case', 'with', 'import', 'export', 'throw',
]);
const DECLARES = /(?:function|class)\s*$/;

/**
 * Every call site in the document, as { callee, index, args: {start, end} }.
 * `callee` is the dotted path with whitespace removed. Because this runs on the
 * masked copy, a call written inside a string is not a call site.
 */
export function callSites(doc, within = null) {
  const out = [];
  for (const m of matches(doc, CALL)) {
    if (within && (m.index < within.start || m.index >= within.end)) continue;
    const callee = m.groups[0].replace(/\s+/g, '');
    if (NOT_CALLEES.has(callee)) continue;
    if (DECLARES.test(doc.masked.slice(Math.max(0, m.index - 20), m.index))) continue;
    const parenIndex = m.index + m.match.length - 1;
    const args = balancedRange(doc, parenIndex);
    if (!args) continue;
    out.push({ callee, index: m.index, args });
  }
  return out;
}

/** The string literal values appearing directly inside a call's arguments. */
export function stringArgs(doc, call) {
  return stringLiterals(doc.source, doc.literals)
    .filter((s) => s.start >= call.args.start && s.end <= call.args.end)
    .map((s) => s.text);
}

/** The value of the string literal covering `offset`, read from the original. */
export function stringAt(doc, offset) {
  return readStringAt(doc.source, doc.literals, offset);
}

/** Every string literal in the document, read from the original. */
export function allStrings(doc) {
  return stringLiterals(doc.source, doc.literals);
}

/**
 * The body range of the function expression, arrow function or identifier that
 * begins at `from` in the argument list. Returns null for an identifier, whose
 * body is in another place, which is a declared limit.
 */
export function functionBodyAt(doc, from, limit) {
  const slice = doc.masked.slice(from, limit);
  const arrow = /^\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>\s*/.exec(slice);
  if (arrow) {
    const after = from + arrow[0].length;
    if (doc.masked[after] === '{') return balancedRange(doc, after);
    // A concise arrow body runs to the end of the argument slot.
    return { start: after, end: limit };
  }
  const fn = /^\s*(?:async\s*)?function\s*(?:[A-Za-z_$][A-Za-z0-9_$]*)?\s*\([^)]*\)\s*/.exec(slice);
  if (fn) {
    const after = from + fn[0].length;
    if (doc.masked[after] === '{') return balancedRange(doc, after);
  }
  return null;
}

/**
 * Declared functions in the file, as { name, exported, body }. Covers function
 * declarations and arrow functions assigned to a const.
 */
export function declaredFunctions(doc) {
  const out = [];
  const decl = /(export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  for (const m of matches(doc, decl)) {
    const parenIndex = m.index + m.match.length - 1;
    const params = balancedRange(doc, parenIndex);
    if (!params) continue;
    const brace = doc.masked.indexOf('{', params.end);
    if (brace === -1) continue;
    const body = balancedRange(doc, brace);
    if (!body) continue;
    out.push({ name: m.groups[1], exported: Boolean(m.groups[0]), body, index: m.index });
  }
  const assigned = /(export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?=\(|[A-Za-z_$])/g;
  for (const m of matches(doc, assigned)) {
    const from = m.index + m.match.length;
    const body = functionBodyAt(doc, from, doc.masked.length);
    if (!body) continue;
    const between = doc.masked.slice(from, body.start);
    if (!between.includes('=>')) continue;
    out.push({ name: m.groups[1], exported: Boolean(m.groups[0]), body, index: m.index });
  }
  return out;
}

/** True when `range` contains a call whose dotted callee matches `test`. */
export function hasCall(doc, range, test) {
  return callSites(doc, range).some((c) => test(c.callee));
}

/** Text of the masked copy inside a range, for pattern work. */
export function maskedText(doc, range) {
  return doc.masked.slice(range.start, range.end);
}

/** Text of the original inside a range, for value work. */
export function sourceText(doc, range) {
  return doc.source.slice(range.start, range.end);
}

/** Ranges of every try block and its catch block. */
export function tryCatches(doc, within = null) {
  const out = [];
  for (const m of matches(doc, /\btry\s*\{/g)) {
    if (within && (m.index < within.start || m.index >= within.end)) continue;
    const brace = m.index + m.match.length - 1;
    const tryBody = balancedRange(doc, brace);
    if (!tryBody) continue;
    const after = doc.masked.slice(tryBody.end + 1, tryBody.end + 80);
    const cm = /^\s*catch\s*(?:\([^)]*\))?\s*\{/.exec(after);
    if (!cm) {
      out.push({ tryBody, catchBody: null });
      continue;
    }
    const catchBrace = tryBody.end + 1 + cm[0].length - 1;
    const catchBody = balancedRange(doc, catchBrace);
    out.push({ tryBody, catchBody });
  }
  return out;
}

/** Module level statements, i.e. text outside every declared function body. */
export function topLevelRanges(doc) {
  const bodies = declaredFunctions(doc).map((f) => f.body).sort((a, b) => a.start - b.start);
  const out = [];
  let cursor = 0;
  for (const b of bodies) {
    if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, doc.masked.length) });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < doc.masked.length) out.push({ start: cursor, end: doc.masked.length });
  return out;
}

export function inAnyRange(ranges, offset) {
  return ranges.some((r) => offset >= r.start && offset < r.end);
}
