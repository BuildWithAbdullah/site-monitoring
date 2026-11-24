// Area D: real user monitoring and error reporting.
//
// Client side instrumentation, read statically. The recurring theme is that the
// act of measuring changes the measurement, and the second theme is that an
// error payload is the least audited thing that leaves a page.

import { finding } from '../finding.mjs';
import {
  prepare, callSites, stringArgs, allStrings, maskedText, lineAt,
  topLevelRanges, inAnyRange, declaredFunctions, balancedRange, functionBodyAt,
} from '../scan/js.mjs';

const INIT_CALLEES = [
  /(^|\.)init$/, /(^|\.)initialise$/, /(^|\.)initialize$/, /(^|\.)start$/,
  /(^|\.)configure$/, /(^|\.)setup$/, /(^|\.)createMonitor$/, /(^|\.)install$/,
];
const SEND_CALLEES = [
  /(^|\.)sendBeacon$/, /^fetch$/, /(^|\.)send$/, /(^|\.)post$/, /(^|\.)report$/,
  /(^|\.)track$/, /(^|\.)capture$/, /(^|\.)flush$/, /(^|\.)open$/,
];
const CONSENT_TOKENS = /\b(consent|granted|optIn|optedIn|gdpr|allowAnalytics|hasPermission|trackingAllowed)\b/i;
const PII_HIGH_KEYS = ['email', 'phone', 'telephone', 'address', 'postcode', 'ssn', 'accountNumber', 'cardNumber', 'fullName', 'dateOfBirth'];
const VITALS_TOKENS = ['largest-contentful-paint', 'first-contentful-paint', 'navigation', 'LCP', 'FCP', 'TTFB', 'INP', 'web-vital', 'webVitals'];

function isInit(callee) {
  return INIT_CALLEES.some((r) => r.test(callee));
}

function isSend(callee) {
  return SEND_CALLEES.some((r) => r.test(callee));
}

function listeners(doc) {
  const out = [];
  for (const call of callSites(doc)) {
    if (!/(^|\.)addEventListener$/.test(call.callee)) continue;
    const args = stringArgs(doc, call);
    if (args.length === 0) continue;
    let depth = 0;
    let handlerStart = -1;
    for (let i = call.args.start; i < call.args.end; i += 1) {
      const ch = doc.masked[i];
      if (ch === '(' || ch === '[' || ch === '{') depth += 1;
      else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
      else if (ch === ',' && depth === 0 && handlerStart === -1) handlerStart = i + 1;
    }
    let body = handlerStart === -1 ? null : { start: handlerStart, end: call.args.end };
    if (body) {
      // A handler passed by name is resolved to the function declared in this
      // file. Without this, a listener written as addEventListener('x', onX)
      // had no body to look at and every check about what the handler does was
      // silently skipped.
      const slot = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*$/.exec(doc.masked.slice(body.start, body.end));
      if (slot) {
        const declared = declaredFunctions(doc).find((f) => f.name === slot[1]);
        if (declared) body = declared.body;
      }
    }
    out.push({ event: args[0], call, body });
  }
  for (const m of maskedText(doc, { start: 0, end: doc.masked.length }).matchAll(/\b(?:window|document|self)\s*\.\s*on(unload|beforeunload|error|visibilitychange|pagehide|pageshow)\s*=/g)) {
    out.push({ event: m[1], call: { callee: `on${m[1]}`, index: m.index, args: { start: m.index, end: m.index + m[0].length } }, body: null, assigned: true });
  }
  return out;
}

/** The block ranges of every conditional written at module scope. */
function topLevelConditionalRanges(doc) {
  const out = [];
  const top = topLevelRanges(doc);
  for (const m of doc.masked.matchAll(/\b(?:if|else\s+if)\s*\(/g)) {
    if (!inAnyRange(top, m.index)) continue;
    const paren = m.index + m[0].length - 1;
    const condition = balancedRange(doc, paren);
    if (!condition) continue;
    const brace = doc.masked.indexOf('{', condition.end);
    if (brace === -1) continue;
    const block = balancedRange(doc, brace);
    if (block) out.push(block);
  }
  return out;
}

function optionsTextOf(doc, call) {
  return maskedText(doc, call.args);
}

/**
 * The send calls reachable from a range, following one level of indirection
 * into functions declared in this file. A beacon sent from a local flush
 * helper is still a beacon sent, and reading only the calls written directly in
 * the handler reported a correct file as sending its final measurement the
 * wrong way.
 */
function reachableSends(doc, range) {
  const direct = callSites(doc, range);
  const out = direct.filter((c) => isSend(c.callee));
  const declared = declaredFunctions(doc);
  for (const call of direct) {
    const name = call.callee.split('.').pop();
    const fn = declared.find((f) => f.name === name && f.name === call.callee);
    if (!fn) continue;
    for (const inner of callSites(doc, fn.body)) {
      if (isSend(inner.callee)) out.push(inner);
    }
  }
  return out;
}

/**
 * The callback bodies of every PerformanceObserver in the file that goes on to
 * observe layout shift. The entry type is a string, so it is read from the
 * original through stringArgs rather than from the masked copy.
 */
function layoutShiftObservers(doc) {
  const calls = callSites(doc);
  const out = [];
  for (const call of calls) {
    if (!/(^|\.)PerformanceObserver$/.test(call.callee)) continue;
    const observe = calls.find((c) => /(^|\.)observe$/.test(c.callee) && c.index > call.args.end);
    if (!observe) continue;
    const types = stringArgs(doc, observe);
    const optionText = maskedText(doc, observe.args);
    const named = types.some((t) => t.includes('layout-shift'));
    if (!named && !/\blayoutShift\b/.test(optionText)) continue;
    const body = functionBodyAt(doc, call.args.start, call.args.end);
    if (body) out.push(body);
  }
  return out;
}

export function checkRum(input) {
  const doc = prepare(input.text);
  const whole = { start: 0, end: doc.masked.length };
  const text = maskedText(doc, whole);
  const out = [];
  const calls = callSites(doc);
  const inits = calls.filter((c) => isInit(c.callee));
  const events = listeners(doc);
  const strings = allStrings(doc).map((s) => s.text);

  const looksLikeInstrumentation = inits.length > 0
    || events.some((e) => ['error', 'unhandledrejection', 'visibilitychange', 'pagehide', 'pageshow', 'unload', 'beforeunload'].includes(e.event))
    || /PerformanceObserver|performance\s*\.\s*getEntries|navigator\s*\.\s*sendBeacon/.test(text);
  if (!looksLikeInstrumentation) return out;

  // D1: a script element created and appended without async or defer.
  const scriptCreations = calls.filter((c) => /(^|\.)createElement$/.test(c.callee)
    && stringArgs(doc, c).some((a) => a.toLowerCase() === 'script'));
  if (scriptCreations.length > 0) {
    const deferred = /\.\s*(async|defer)\s*=\s*(true|1)\b/.test(text)
      || calls.some((c) => /(^|\.)setAttribute$/.test(c.callee)
        && stringArgs(doc, c).some((a) => a === 'async' || a === 'defer'));
    if (!deferred) {
      out.push(finding('rum-script-blocks-render', 'high', lineAt(doc, scriptCreations[0].index),
        'the injected script is neither async nor deferred'));
    }
  }
  if (calls.some((c) => /(^|\.)write$/.test(c.callee) && c.callee.startsWith('document.'))) {
    out.push(finding('rum-script-blocks-render', 'high', lineAt(doc, calls.find((c) => /(^|\.)write$/.test(c.callee)).index),
      'document.write blocks the parser'));
  }

  for (const init of inits) {
    const options = optionsTextOf(doc, init);

    if (!/\b(sampleRate|samplingRate|tracesSampleRate|sampling|sampleSize)\b/.test(options)) {
      out.push(finding('rum-sample-rate-missing', 'medium', lineAt(doc, init.index),
        `${init.callee} declares no sample rate`));
    }

    if (!/\b(release|version|buildId|revision|dist|commit)\b/.test(options)) {
      out.push(finding('rum-release-not-attached', 'low', lineAt(doc, init.index),
        `${init.callee} attaches no release identifier`));
    }

    const capturesErrors = /\b(dsn|captureUncaught|captureUnhandled|errors|errorReporting|onError)\b/.test(options)
      || /(^|\.)captureException$/.test(init.callee)
      || calls.some((c) => /(^|\.)captureException$/.test(c.callee));
    if (capturesErrors && !/\b(beforeSend|beforeBreadcrumb|scrub|sanitize|sanitise|redact|denyUrls|allowKeys)\b/.test(options)) {
      out.push(finding('rum-no-beforesend-scrub', 'medium', lineAt(doc, init.index),
        `${init.callee} configures error reporting with no scrubbing hook`));
    }
  }

  // D7: instrumentation started at the top level with nothing gating it.
  //
  // An init inside a conditional is gated by something, and this cannot know
  // what the condition means. Reporting it anyway manufactured a finding
  // against a file whose init sat inside `if (analyticsAllowed())`. The price
  // is a declared limit: an init guarded by a condition unrelated to consent is
  // not reported.
  const topLevel = topLevelRanges(doc);
  const guarded = topLevelConditionalRanges(doc);
  const topInit = inits.find((c) => inAnyRange(topLevel, c.index) && !inAnyRange(guarded, c.index));
  if (topInit && !CONSENT_TOKENS.test(text)) {
    out.push(finding('rum-init-before-consent', 'high', lineAt(doc, topInit.index),
      `${topInit.callee} runs at module scope with no consent gate`));
  }

  // D3 and D4: how the last beacon of the session leaves the page.
  const unloadEvents = events.filter((e) => e.event === 'unload' || e.event === 'beforeunload');
  for (const e of unloadEvents) {
    const body = e.body ?? { start: e.call.index, end: Math.min(doc.masked.length, e.call.index + 400) };
    if (reachableSends(doc, body).length > 0 || e.assigned) {
      out.push(finding('rum-beacon-on-unload', 'high', lineAt(doc, e.call.index),
        `metrics are sent from a ${e.event} handler`));
      break;
    }
  }

  const hiddenEvents = events.filter((e) => e.event === 'visibilitychange' || e.event === 'pagehide');
  for (const e of hiddenEvents) {
    if (!e.body) continue;
    const sends = reachableSends(doc, e.body);
    if (sends.length === 0) continue;
    const usesBeacon = sends.some((c) => /sendBeacon$/.test(c.callee));
    const keepsAlive = sends.some((c) => /\bkeepalive\s*:\s*true\b/.test(maskedText(doc, c.args)));
    if (!usesBeacon && !keepsAlive) {
      out.push(finding('rum-beacon-not-sendbeacon', 'medium', lineAt(doc, sends[0].index),
        'the final beacon is an ordinary request and is cancelled with the document'));
      break;
    }
  }

  // D5: a restored page is not a fresh load.
  const readsVitals = VITALS_TOKENS.some((t) => strings.some((s) => s.includes(t)))
    || /PerformanceObserver|getEntriesByType/.test(text);
  if (readsVitals && !/\bpersisted\b|\bnavigationType\b|\bbfcache\b|back_forward/.test(text)) {
    out.push(finding('rum-ignores-bfcache-restore', 'medium', null,
      'nothing distinguishes a back forward cache restore from a load'));
  }

  // D6: layout shift is only final when the page is hidden.
  //
  // The event name this needs is a string argument, and every scanner here runs
  // on the masked copy where a string's contents have been blanked. Reading the
  // event names out of the masked text made this check miss its own corrected
  // example, which reports from a visibilitychange handler. The event names
  // come from `events`, which reads them from the original.
  const clsObservers = layoutShiftObservers(doc);
  const hasHiddenHandler = events.some((e) => e.event === 'visibilitychange' || e.event === 'pagehide');
  if (clsObservers.length > 0) {
    const sendsFromObserver = clsObservers.find((body) => callSites(doc, body).some((c) => isSend(c.callee)));
    if (sendsFromObserver) {
      out.push(finding('rum-cls-reported-early', 'medium', lineAt(doc, sendsFromObserver.start),
        'the value is sent from the observer callback, so every intermediate value is reported as final'));
    } else if (!hasHiddenHandler) {
      out.push(finding('rum-cls-reported-early', 'medium', null,
        'nothing reports the layout shift value at the point it becomes final'));
    }
  }

  // D8: what the payload carries.
  const cookieRead = /\bdocument\s*\.\s*cookie\b/.test(text);
  const piiKey = PII_HIGH_KEYS.find((k) => new RegExp(`\\b${k}\\b`, 'i').test(text));
  if (cookieRead || piiKey) {
    out.push(finding('rum-pii-in-payload', 'high', null,
      cookieRead ? 'the payload reads document.cookie' : `the payload carries ${piiKey}`));
  } else if (/\blocation\s*\.\s*(search|href)\b|\bwindow\s*\.\s*location\s*\.\s*(search|href)\b/.test(text)) {
    out.push(finding('rum-pii-in-payload', 'medium', null,
      'the payload carries the raw URL including its query string'));
  }

  // D10 and D11: the global error path.
  const assignsOnError = /\b(?:window|self|globalThis)\s*\.\s*onerror\s*=/.test(text);
  if (assignsOnError) {
    const at = text.search(/\b(?:window|self|globalThis)\s*\.\s*onerror\s*=/);
    out.push(finding('rum-onerror-overwrites-handler', 'medium', lineAt(doc, at),
      'assigning the global error handler replaces whatever was already there'));
  }
  const capturesErrors = assignsOnError
    || events.some((e) => e.event === 'error')
    || calls.some((c) => /(^|\.)captureException$/.test(c.callee));
  if (capturesErrors && !events.some((e) => e.event === 'unhandledrejection')) {
    out.push(finding('rum-rejections-uncaptured', 'medium', null,
      'errors are captured but rejected promises are not'));
  }

  return out;
}
