// Masking.
//
// Every scanner in this repository runs over a masked copy of the source, in
// which the interior of every string, template literal and regular expression
// and the whole of every comment has been replaced by a run of spaces of the
// same length. Newlines are preserved, so an offset or a line number taken from
// the masked copy addresses the same character in the original.
//
// Two reasons. A scanner that looks for code must not read code quoted inside a
// string, or a test that builds a fake module out of string literals gets
// reported as if the fake module were real. And a scanner that looks for a
// forbidden token must not read the token out of its own prose.
//
// A check that needs a *value* out of a string has the opposite problem, so
// scanners return ranges and the caller decides which copy to slice. See
// readStringAt below.

const SPACE = ' ';

// A slash begins a regular expression when the previous significant character
// cannot end an expression. This is the usual heuristic and it is wrong for a
// very small number of real programs; the limit is declared.
const BEFORE_REGEX = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*',
  '%', '~', '^', '<', '>', '\n',
]);
const KEYWORDS_BEFORE_REGEX = ['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'instanceof', 'yield', 'await', 'new', 'do', 'else'];

function regexAllowedAt(source, index) {
  let i = index - 1;
  while (i >= 0 && (source[i] === ' ' || source[i] === '\t')) i -= 1;
  if (i < 0) return true;
  const ch = source[i];
  if (BEFORE_REGEX.has(ch)) return true;
  if (/[A-Za-z0-9_$]/.test(ch)) {
    let end = i + 1;
    let start = i;
    while (start >= 0 && /[A-Za-z0-9_$]/.test(source[start])) start -= 1;
    const word = source.slice(start + 1, end);
    return KEYWORDS_BEFORE_REGEX.includes(word);
  }
  return false;
}

function blank(length) {
  return SPACE.repeat(length);
}

/**
 * Returns { masked, literals } where `masked` is the same length as `source`
 * and `literals` lists every masked region as { kind, start, end }, with start
 * and end being the offsets of the region's *interior* for a string or regular
 * expression and of the whole token for a comment.
 */
export function maskSource(source) {
  const out = [];
  const literals = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];

    if (ch === '/' && source[i + 1] === '/') {
      let j = i;
      while (j < n && source[j] !== '\n') j += 1;
      out.push(blank(j - i));
      literals.push({ kind: 'line-comment', start: i, end: j });
      i = j;
      continue;
    }

    if (ch === '/' && source[i + 1] === '*') {
      let j = i + 2;
      while (j < n && !(source[j] === '*' && source[j + 1] === '/')) j += 1;
      const end = Math.min(j + 2, n);
      for (let k = i; k < end; k += 1) out.push(source[k] === '\n' ? '\n' : SPACE);
      literals.push({ kind: 'block-comment', start: i, end });
      i = end;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < n) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === quote || source[j] === '\n') break;
        j += 1;
      }
      const interiorEnd = j;
      out.push(quote);
      for (let k = i + 1; k < interiorEnd; k += 1) out.push(source[k] === '\n' ? '\n' : SPACE);
      literals.push({ kind: 'string', start: i + 1, end: interiorEnd });
      if (source[interiorEnd] === quote) {
        out.push(quote);
        i = interiorEnd + 1;
      } else {
        i = interiorEnd;
      }
      continue;
    }

    if (ch === '`') {
      // A template literal may contain substitutions, and the code inside a
      // substitution is code. Mask the text runs and leave the substitutions.
      out.push('`');
      let j = i + 1;
      let runStart = j;
      let depth = 0;
      while (j < n) {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (depth === 0 && source[j] === '$' && source[j + 1] === '{') {
          for (let k = runStart; k < j; k += 1) out.push(source[k] === '\n' ? '\n' : SPACE);
          literals.push({ kind: 'template-text', start: runStart, end: j });
          out.push('$', '{');
          j += 2;
          depth = 1;
          let braceDepth = 1;
          const codeStart = j;
          while (j < n && braceDepth > 0) {
            if (source[j] === '{') braceDepth += 1;
            else if (source[j] === '}') braceDepth -= 1;
            if (braceDepth > 0) j += 1;
          }
          // The substitution body is itself masked, recursively.
          const inner = maskSource(source.slice(codeStart, j));
          out.push(inner.masked);
          for (const lit of inner.literals) {
            literals.push({ kind: lit.kind, start: lit.start + codeStart, end: lit.end + codeStart });
          }
          if (source[j] === '}') { out.push('}'); j += 1; }
          depth = 0;
          runStart = j;
          continue;
        }
        if (source[j] === '`') break;
        j += 1;
      }
      for (let k = runStart; k < Math.min(j, n); k += 1) out.push(source[k] === '\n' ? '\n' : SPACE);
      if (j > runStart) literals.push({ kind: 'template-text', start: runStart, end: Math.min(j, n) });
      if (source[j] === '`') { out.push('`'); i = j + 1; } else { i = j; }
      continue;
    }

    if (ch === '/' && regexAllowedAt(source, i)) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < n) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === '\n') break;
        if (source[j] === '[') inClass = true;
        else if (source[j] === ']') inClass = false;
        else if (source[j] === '/' && !inClass) { closed = true; break; }
        j += 1;
      }
      if (closed) {
        out.push('/');
        out.push(blank(j - i - 1));
        literals.push({ kind: 'regex', start: i + 1, end: j });
        out.push('/');
        j += 1;
        while (j < n && /[a-z]/.test(source[j])) { out.push(source[j]); j += 1; }
        i = j;
        continue;
      }
    }

    out.push(ch);
    i += 1;
  }

  const masked = out.join('');
  if (masked.length !== source.length) {
    throw new Error(`mask length drifted: ${masked.length} from ${source.length}`);
  }
  return { masked, literals };
}

/**
 * The string literal whose interior covers `offset`, read from the ORIGINAL
 * source. This is how a check that needs a value gets at it without any scanner
 * reading quoted text as code.
 */
export function readStringAt(source, literals, offset) {
  for (const lit of literals) {
    if ((lit.kind === 'string' || lit.kind === 'template-text') && offset >= lit.start && offset < lit.end) {
      return source.slice(lit.start, lit.end);
    }
  }
  return null;
}

/** Every string literal interior in the file, read from the original source. */
export function stringLiterals(source, literals) {
  return literals
    .filter((l) => l.kind === 'string' || l.kind === 'template-text')
    .map((l) => ({ text: source.slice(l.start, l.end), start: l.start, end: l.end }));
}

export function lineOf(source, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1;
  }
  return line;
}
