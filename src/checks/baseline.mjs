// Area G: baselines and regression diffs.
//
// Two input kinds. A baseline document is JSON and is judged on what it records
// about itself. A diff script is JavaScript and is judged on how it decides
// that something changed, which is almost entirely a question of what it uses
// as the identity of a finding.

import { finding } from '../finding.mjs';
import {
  prepare, callSites, stringArgs, maskedText, lineAt, allStrings,
} from '../scan/js.mjs';

const BASELINE_TOKENS = /\b(baseline|previous|lastRun|snapshot)\b/;
const WRITE_CALLEES = [/(^|\.)writeFile$/, /(^|\.)writeFileSync$/, /(^|\.)outputJson$/, /(^|\.)save$/, /(^|\.)writeBaseline$/];
const READ_CALLEES = [/(^|\.)readFile$/, /(^|\.)readFileSync$/, /(^|\.)readJson$/, /(^|\.)loadBaseline$/];
const RESOLVED_TOKENS = /\b(resolved|fixed|disappeared|cleared|removed|closed|wentAway)\b/i;

export function checkBaselineDocument(conf) {
  const doc = conf.value;
  const out = [];
  if (!doc || !Array.isArray(doc.findings)) return out;
  const stamp = doc.generatedAt ?? doc.createdAt ?? doc.timestamp ?? doc.recordedAt;
  // An epoch number is a generation time. Demanding a string reported every
  // baseline written by a tool that stores timestamps as numbers.
  const recorded = (typeof stamp === 'string' && stamp !== '')
    || (typeof stamp === 'number' && Number.isFinite(stamp));
  if (!recorded) {
    out.push(finding('baseline-staleness-unchecked', 'medium', null,
      'the baseline records no generation time, so nothing can notice it has stopped being updated'));
  }
  return out;
}

export function checkDiffScript(input) {
  const doc = prepare(input.text);
  const whole = { start: 0, end: doc.masked.length };
  const text = maskedText(doc, whole);
  const out = [];
  if (!BASELINE_TOKENS.test(text)) return out;
  const calls = callSites(doc);

  // G1: two lengths compared instead of two sets.
  const countCompare = /\.\s*length\s*(?:-|!==|===|==|!=|>|<|>=|<=)\s*[A-Za-z_$][A-Za-z0-9_$.[\]]*\s*\.\s*length/.exec(text);
  if (countCompare) {
    out.push(finding('diff-compares-counts', 'high', lineAt(doc, countCompare.index),
      'the comparison is between two counts, so one new and one fixed finding cancel out'));
  }

  // G3: an identity built out of a position in a file.
  const keyWithLine = /(?:key|id|identity|fingerprint|signature)[^=;\n]{0,60}\b[A-Za-z_$][A-Za-z0-9_$]*\s*\.\s*line\b/.exec(text)
    || /\$\{\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\.\s*line\s*\}/.exec(text)
    || /\+\s*['"`]?[:@|]['"`]?\s*\+\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\.\s*line\b/.exec(text);
  if (keyWithLine) {
    out.push(finding('diff-identity-includes-line', 'high', lineAt(doc, keyWithLine.index),
      'the finding identity carries a line number, so any reflow reports every finding as changed'));
  }

  const computesRegressions = /\b(regressions?|newFindings|introduced|added)\b/i.test(text);

  // G2: only one direction of the comparison is computed.
  if (computesRegressions && !RESOLVED_TOKENS.test(text)) {
    out.push(finding('diff-ignores-resolved', 'medium', null,
      'findings that disappeared are never reported, so a detector that stopped working looks like a fix'));
  }

  // G4: regressions found and the process still succeeds.
  if (computesRegressions) {
    const exitsNonZero = /process\s*\.\s*exit\s*\(\s*[1-9]/.test(text)
      || /process\s*\.\s*exitCode\s*=\s*[1-9]/.test(text)
      || /\bthrow\s+new\s+Error\b/.test(text);
    if (!exitsNonZero) {
      out.push(finding('diff-exit-zero-on-regression', 'high', null,
        'regressions are printed and the run still succeeds, so nothing downstream can react'));
    }
  }

  // G5: the baseline written from the run it is about to be compared against.
  const writes = calls.filter((c) => WRITE_CALLEES.some((r) => r.test(c.callee))
    && stringArgsLower(doc, c).some((a) => BASELINE_TOKENS.test(a)));
  const reads = calls.filter((c) => READ_CALLEES.some((r) => r.test(c.callee))
    && stringArgsLower(doc, c).some((a) => BASELINE_TOKENS.test(a)));
  const compareIndex = firstCompareIndex(text);
  if (writes.length > 0 && compareIndex !== -1) {
    const writeBeforeCompare = writes.some((w) => w.index < compareIndex);
    const readBeforeWrite = reads.some((r) => writes.every((w) => r.index < w.index));
    if (writeBeforeCompare && !readBeforeWrite) {
      out.push(finding('baseline-regenerated-before-compare', 'high', lineAt(doc, writes[0].index),
        'the baseline is written from this run before the comparison, so the comparison is against itself'));
    }
  }

  return out;
}

function stringArgsLower(doc, call) {
  return stringArgs(doc, call);
}

function firstCompareIndex(text) {
  const patterns = [
    /\bdiff\s*\(/, /\.\s*filter\s*\(/, /\bcompare\s*\(/, /\bdifference\s*\(/, /\.\s*has\s*\(/,
  ];
  let best = -1;
  for (const p of patterns) {
    const m = p.exec(text);
    if (m && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}
