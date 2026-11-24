// Which files git would track.
//
// A verifier that counts text files, or asserts something about every file in
// the tree, has to agree with git about what is in the tree. This implements
// enough of the ignore rules to do that: directory and file patterns, anchored
// and unanchored, negations with last match wins, and the rule that a negation
// cannot re-include a file inside an excluded directory.
//
// It is checked against `git ls-files` in CI on a purpose built tree, including
// that last case, because an ignore matcher nobody compares to git is a
// plausible looking guess.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

function toRegExp(pattern) {
  let body = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        body += '.*';
        i += 1;
        if (pattern[i + 1] === '/') i += 1;
      } else {
        body += '[^/]*';
      }
    } else if (ch === '?') body += '[^/]';
    else if ('\\^$.|+()[]{}'.includes(ch)) body += `\\${ch}`;
    else body += ch;
  }
  return new RegExp(`^${body}$`);
}

export function parseIgnore(text) {
  const rules = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (line === '' || line.startsWith('#')) continue;
    let pattern = line;
    let negated = false;
    if (pattern.startsWith('!')) {
      negated = true;
      pattern = pattern.slice(1);
    }
    let directoryOnly = false;
    if (pattern.endsWith('/')) {
      directoryOnly = true;
      pattern = pattern.slice(0, -1);
    }
    const anchored = pattern.includes('/');
    rules.push({
      negated,
      directoryOnly,
      anchored,
      regex: toRegExp(anchored ? pattern.replace(/^\//, '') : pattern),
    });
  }
  return rules;
}

function matchesRule(rule, relPath, isDirectory) {
  if (rule.directoryOnly && !isDirectory) {
    // A directory pattern also excludes everything under that directory, which
    // is handled by the caller walking directories before files.
    return false;
  }
  if (rule.anchored) return rule.regex.test(relPath);
  const base = relPath.split('/').pop();
  return rule.regex.test(base) || rule.regex.test(relPath);
}

/** True when the path is ignored. Last matching rule wins. */
export function isIgnored(rules, relPath, isDirectory) {
  let ignored = false;
  for (const rule of rules) {
    if (matchesRule(rule, relPath, isDirectory)) ignored = !rule.negated;
  }
  return ignored;
}

/**
 * Every file git would track under `root`, relative to it, sorted. A negation
 * inside an excluded directory cannot bring a file back, which is git's
 * behaviour and the case most hand written matchers get wrong, so the walk
 * stops at an excluded directory rather than filtering file by file.
 */
export function trackedFiles(root) {
  const ignorePath = join(root, '.gitignore');
  const rules = existsSync(ignorePath) ? parseIgnore(readFileSync(ignorePath, 'utf8')) : [];
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = join(dir, entry.name);
      const rel = relative(root, full).split(sep).join('/');
      if (entry.isDirectory()) {
        if (entry.name === '.git') continue;
        if (isIgnored(rules, rel, true)) continue;
        walk(full);
        continue;
      }
      if (isIgnored(rules, rel, false)) continue;
      out.push(rel);
    }
  };
  walk(root);
  return out.sort();
}
