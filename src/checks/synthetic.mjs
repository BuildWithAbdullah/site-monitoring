// Area E: synthetic journeys.
//
// A journey is recognised by what it drives rather than by its filename, so a
// file that never opens a page is not judged as one.

import { finding } from '../finding.mjs';
import {
  prepare, callSites, stringArgs, allStrings, maskedText, lineAt,
  declaredFunctions, topLevelRanges, inAnyRange,
} from '../scan/js.mjs';

const DRIVE_CALLEES = [/(^|\.)goto$/, /(^|\.)newPage$/, /(^|\.)launch$/, /(^|\.)visit$/, /(^|\.)open$/];
// A call named expectSomething or assertSomething is an assertion, which is the
// convention a journey helper is usually written to. A helper named anything
// else is not recognised, and that is a declared limit rather than a guess.
const ASSERT_CALLEES = [
  /^expect/, /(^|\.)expect/, /^assert/, /(^|\.)assert/, /^verify[A-Z]/, /(^|\.)waitForSelector$/,
  /(^|\.)waitForFunction$/, /(^|\.)waitForResponse$/, /(^|\.)toBeVisible$/,
  /(^|\.)toHaveText$/, /(^|\.)toContain$/, /(^|\.)ok$/, /(^|\.)strictEqual$/,
  /(^|\.)deepStrictEqual$/, /(^|\.)match$/,
];
const SLEEP_CALLEES = [/(^|\.)waitForTimeout$/, /^sleep$/, /(^|\.)sleep$/, /^delay$/, /(^|\.)pause$/];
const ARTIFACT_CALLEES = [/(^|\.)screenshot$/, /(^|\.)saveTrace$/, /(^|\.)stopTracing$/, /(^|\.)video$/, /(^|\.)saveArtifact$/, /(^|\.)content$/];
const WRITE_SELECTORS = /(checkout|place-?order|submit-?order|confirm-?order|pay-?now|buy-?now|add-?to-?cart|subscribe|register|sign-?up)/i;
const MARKERS = /\b(SYNTHETIC|synthetic|isMonitor|monitorRun|testOrder|smokeTest|canary|MONITOR_RUN)\b/;
const CLEANUP = /\b(cleanup|teardown|afterEach|afterAll|cancelOrder|deleteOrder|revert|rollback|removeTestData)\b/;
const SECRET_NAMES = /\b(password|passwd|pwd|secret|apiKey|apiToken|authToken|accessToken|privateKey)\b/i;

function anyMatch(callee, patterns) {
  return patterns.some((r) => r.test(callee));
}

export function checkSynthetic(input) {
  const doc = prepare(input.text);
  const whole = { start: 0, end: doc.masked.length };
  const text = maskedText(doc, whole);
  const out = [];
  const calls = callSites(doc);

  const drives = calls.filter((c) => anyMatch(c.callee, DRIVE_CALLEES));
  if (drives.length === 0) return out;

  const asserts = calls.filter((c) => anyMatch(c.callee, ASSERT_CALLEES));
  if (asserts.length === 0 && !/\bthrow\s+new\s+Error\b/.test(text)) {
    out.push(finding('journey-asserts-navigation-only', 'high', lineAt(doc, drives[0].index),
      'the journey drives the page and asserts nothing about what it rendered'));
  }

  const sleeps = calls.filter((c) => anyMatch(c.callee, SLEEP_CALLEES));
  const inlineSleep = /new\s+Promise\s*\([^)]*=>\s*setTimeout/.test(text);
  if (sleeps.length > 0 || inlineSleep) {
    out.push(finding('journey-hard-sleep', 'medium',
      sleeps.length > 0 ? lineAt(doc, sleeps[0].index) : null,
      'a fixed sleep stands in for waiting on a condition'));
  }

  // E3: a credential written into the file. The masked copy keeps the quote
  // characters, so an assignment of a literal is still visible while its value
  // is not, and nothing here ever reads the value.
  const literalAssign = new RegExp(`${SECRET_NAMES.source}\\s*[:=]\\s*['"\`]`, 'i').exec(text);
  const filledLiteral = calls.find((c) => /(^|\.)(fill|type)$/.test(c.callee)
    && stringArgs(doc, c).length >= 2
    && SECRET_NAMES.test(stringArgs(doc, c)[0]));
  if (literalAssign || filledLiteral) {
    out.push(finding('journey-credentials-inline', 'high',
      literalAssign ? lineAt(doc, literalAssign.index) : lineAt(doc, filledLiteral.index),
      'a credential is written into the journey rather than read from the environment'));
  }

  // E4: a journey that commits a transaction against the real site.
  const writeAction = calls.find((c) => /(^|\.)(click|press|submit|tap)$/.test(c.callee)
    && stringArgs(doc, c).some((a) => WRITE_SELECTORS.test(a)));
  if (writeAction && !MARKERS.test(text) && !CLEANUP.test(text)) {
    out.push(finding('journey-writes-production-data', 'high', lineAt(doc, writeAction.index),
      'the journey commits a transaction with neither a marker nor a cleanup step'));
  }

  const artifacts = calls.filter((c) => anyMatch(c.callee, ARTIFACT_CALLEES));
  if (artifacts.length === 0) {
    out.push(finding('journey-no-failure-artifact', 'low', null,
      'a failing run keeps no screenshot, trace or response body'));
  }

  // E6: module level mutable state written from inside a step.
  const topLevel = topLevelRanges(doc);
  const declared = [];
  for (const range of topLevel) {
    const slice = doc.masked.slice(range.start, range.end);
    for (const m of slice.matchAll(/\b(?:let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
      declared.push(m[1]);
    }
  }
  if (declared.length > 0) {
    const fns = declaredFunctions(doc);
    const writtenInside = declared.find((name) => fns.some((fn) => {
      const body = maskedText(doc, fn.body);
      return new RegExp(`\\b${name}\\s*(?:=[^=]|\\+\\+|--|\\.push\\s*\\()`).test(body);
    }));
    if (writtenInside) {
      out.push(finding('journey-shared-state-between-steps', 'medium', null,
        `${writtenInside} is declared at module scope and written from inside a step`));
    }
  }

  return out;
}
