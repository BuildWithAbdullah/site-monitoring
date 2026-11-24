// Area A: health and readiness endpoints.
//
// Everything here reads the masked copy of the source for structure and the
// original only where a value is needed, which is the route paths and the
// strings that end up in the response body.

import { finding } from '../finding.mjs';
import {
  prepare, callSites, declaredFunctions, tryCatches, stringArgs, allStrings,
  balancedRange, functionBodyAt, lineAt, maskedText, topLevelRanges, inAnyRange,
} from '../scan/js.mjs';

// A dependency probe is recognised by the name of the thing being called,
// against this list. A probe through a wrapper of another name is not seen,
// which is a declared limit.
const PROBE_METHODS = ['ping', 'query', 'execute', 'get', 'exists', 'info', 'raw', 'authenticate', 'connect', 'healthCheck', 'describeTable', 'head'];
const PROBE_OBJECTS = ['db', 'pool', 'redis', 'cache', 'client', 'store', 'queue', 'conn', 'database', 'sql', 'prisma', 'mongo', 'es', 'search', 's3', 'bucket'];
const WRITE_METHODS = ['insert', 'update', 'create', 'save', 'put', 'set', 'write', 'upsert', 'delete', 'incr'];

const READY_PATHS = [/^\/_?(health|healthz|healthcheck|status|ready|readyz|readiness)\b/i];
// Readiness is narrower than health. Only an endpoint that says it answers
// whether the process should receive traffic is held to the warmup rule, since
// a general health endpoint is not making that promise.
const READINESS_PATHS = [/^\/_?(ready|readyz|readiness)\b/i];
const LIVE_PATHS = [/^\/_?(live|livez|liveness|ping)\b/i];

const UNHEALTHY_WORDS = ['degraded', 'unhealthy', 'down', 'failing', 'failed', 'unavailable', 'error'];
const READY_FLAGS = ['ready', 'isready', 'warm', 'warmedup', 'warmup', 'bootstrapped', 'started', 'initialised', 'initialized'];
const TIMEOUT_SIGNS = ['Promise.race', 'AbortSignal.timeout', 'withTimeout', 'setTimeout', 'timeout', 'AbortController'];

const SECRET_KEYS = ['password', 'secret', 'token', 'connectionstring', 'dsn', 'apikey', 'privatekey', 'credential'];
const DETAIL_SIGNS = ['stack', 'hostname', 'process.env', 'process.version', 'versions', 'uptime', 'cwd', 'argv'];

// Some method names are not ambiguous. A call to ping is a probe whatever it is
// called on, which matters because the receiver is often a loop variable, a
// destructured binding, or reached through optional chaining, and in none of
// those cases does the name of the thing being probed appear at the call site.
const UNAMBIGUOUS_PROBES = ['ping', 'healthCheck', 'authenticate'];

function isProbeCall(callee) {
  const parts = callee.split('.');
  const method = parts[parts.length - 1];
  const object = parts.length > 1 ? parts[parts.length - 2] : '';
  if (UNAMBIGUOUS_PROBES.includes(method)) return true;
  if (!PROBE_METHODS.includes(method)) return false;
  if (parts.length === 1) return false;
  return PROBE_OBJECTS.some((o) => object.toLowerCase().includes(o));
}

function isWriteCall(callee) {
  const parts = callee.split('.');
  if (parts.length < 2) return false;
  const method = parts[parts.length - 1];
  const object = parts[parts.length - 2];
  if (!WRITE_METHODS.includes(method)) return false;
  return PROBE_OBJECTS.some((o) => object.toLowerCase().includes(o));
}

// A probe is bounded when the handler itself carries a timeout sign, or when
// the probe sits inside the arguments of a helper declared in this file whose
// own body carries one. Without the second case a timeout applied by a helper
// named anything other than withTimeout is reported as no timeout at all,
// which is a false positive on correct code.
function boundingHelpers(doc) {
  const names = new Set();
  for (const fn of declaredFunctions(doc)) {
    const body = maskedText(doc, fn.body);
    if (TIMEOUT_SIGNS.some((sign) => body.includes(sign))) names.add(fn.name);
  }
  return names;
}

function probeIsBounded(doc, body, probe, helpers) {
  const bodyText = maskedText(doc, body);
  if (TIMEOUT_SIGNS.some((sign) => bodyText.includes(sign))) return true;
  if (/\bsignal\s*:/.test(maskedText(doc, probe.args))) return true;
  for (const call of callSites(doc, body)) {
    if (!helpers.has(call.callee.split('.').pop())) continue;
    if (probe.index >= call.args.start && probe.index < call.args.end) return true;
  }
  return false;
}

function statusCodesIn(doc, range) {
  const codes = [];
  const text = maskedText(doc, range);
  const base = range.start;
  const push = (code, at) => {
    const n = Number(code);
    if (Number.isFinite(n) && n >= 100 && n < 600) codes.push({ code: n, index: base + at });
  };
  for (const m of text.matchAll(/\.status\s*\(\s*(\d{3})\s*\)/g)) push(m[1], m.index);
  for (const m of text.matchAll(/\.code\s*\(\s*(\d{3})\s*\)/g)) push(m[1], m.index);
  for (const m of text.matchAll(/statusCode\s*=\s*(\d{3})/g)) push(m[1], m.index);
  for (const m of text.matchAll(/\bstatus\s*:\s*(\d{3})/g)) push(m[1], m.index);
  for (const m of text.matchAll(/\bsendStatus\s*\(\s*(\d{3})\s*\)/g)) push(m[1], m.index);
  return codes;
}

function respondsSuccessfully(doc, range) {
  const codes = statusCodesIn(doc, range);
  if (codes.some((c) => c.code >= 200 && c.code < 300)) return true;
  if (codes.some((c) => c.code >= 400)) return false;
  // No status set at all means whatever the framework defaults to, which is 200
  // everywhere this matters.
  //
  // The call has to be recognised from the text rather than from a callee name,
  // because the usual Express form chains the body onto the result of another
  // call. A dotted callee path cannot cross a closing parenthesis, so
  // res.status(code).json(body) was read as no response at all, and every
  // finding that depends on the handler answering was silently skipped
  // whenever the status code came from a variable.
  const text = maskedText(doc, range);
  if (/\.\s*(json|send|end|sendStatus)\s*\(/.test(text)) return true;
  if (/\bResponse\s*\.\s*json\s*\(|new\s+Response\s*\(/.test(text)) return true;
  return false;
}

function stringsIn(doc, range) {
  return allStrings(doc).filter((s) => s.start >= range.start && s.end <= range.end);
}

/**
 * The body of a handler passed by name, when the name belongs to a function
 * declared in this file. Resolving it is what lets one handler registered at
 * two paths be recognised as one handler. A name declared in another module is
 * a declared limit.
 */
function resolveNamedHandler(doc, from, to) {
  const slot = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*$/.exec(doc.masked.slice(from, to));
  if (!slot) return null;
  const declared = declaredFunctions(doc).find((f) => f.name === slot[1]);
  return declared ? declared.body : null;
}

function handlersOf(doc, path) {
  const out = [];
  const seenBodies = new Set();

  const calls = callSites(doc);
  for (const call of calls) {
    if (!/\.(get|all|use|route|head)$/.test(call.callee)) continue;
    const args = stringArgs(doc, call);
    let routePaths = args.filter((a) => a.startsWith('/'));
    let slot = call;
    if (routePaths.length > 0 && /\.route$/.test(call.callee)) {
      // app.route('/healthz').get(handler). The path is on the first call and
      // the handler is on the next one, so neither call carries both and the
      // handler was not audited at all.
      const chained = calls.find((c) => /^(get|head|all)$/.test(c.callee)
        && c.index > call.args.end && c.index <= call.args.end + 8);
      if (chained) slot = chained;
    }
    if (routePaths.length === 0) continue;
    if (slot !== call) {
      const body = functionBodyAt(doc, slot.args.start, slot.args.end)
        ?? resolveNamedHandler(doc, slot.args.start, slot.args.end);
      if (!body) continue;
      const key = `${body.start}:${body.end}`;
      const existing = out.find((h) => `${h.body.start}:${h.body.end}` === key);
      if (existing) {
        existing.paths.push(...routePaths);
        continue;
      }
      seenBodies.add(key);
      out.push({ paths: routePaths, body, index: call.index, named: null });
      continue;
    }
    // The handler is the function sitting after the first comma at depth zero.
    let depth = 0;
    let handlerStart = -1;
    for (let i = call.args.start; i < call.args.end; i += 1) {
      const ch = doc.masked[i];
      if (ch === '(' || ch === '[' || ch === '{') depth += 1;
      else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
      else if (ch === ',' && depth === 0) { handlerStart = i + 1; }
    }
    if (handlerStart === -1) continue;
    const body = functionBodyAt(doc, handlerStart, call.args.end)
      ?? resolveNamedHandler(doc, handlerStart, call.args.end);
    if (!body) continue;
    const key = `${body.start}:${body.end}`;
    const existing = out.find((h) => `${h.body.start}:${h.body.end}` === key);
    if (existing) {
      existing.paths.push(...routePaths);
      continue;
    }
    seenBodies.add(key);
    out.push({ paths: routePaths, body, index: call.index, named: null });
  }

  // A file whose own name says what it serves, exporting a request handler.
  const fileSuggests = /(health|ready|live|status)/i.test(path);
  if (fileSuggests) {
    for (const fn of declaredFunctions(doc)) {
      if (!fn.exported) continue;
      if (!/^(GET|HEAD|handler|default|health|healthHandler|readiness|liveness)$/i.test(fn.name)) continue;
      const key = `${fn.body.start}:${fn.body.end}`;
      if (seenBodies.has(key)) continue;
      seenBodies.add(key);
      const inferred = /live|liveness/i.test(path) ? '/livez' : (/ready/i.test(path) ? '/readyz' : '/healthz');
      out.push({ paths: [inferred], body: fn.body, index: fn.index, named: fn.name });
    }
  }

  return out;
}

function classifyPaths(paths) {
  const ready = paths.some((p) => READY_PATHS.some((r) => r.test(p)));
  const live = paths.some((p) => LIVE_PATHS.some((r) => r.test(p)));
  const readiness = paths.some((p) => READINESS_PATHS.some((r) => r.test(p)));
  return { ready, live, readiness };
}

export function checkHealth(input) {
  const doc = prepare(input.text);
  const out = [];
  const handlers = handlersOf(doc, input.path);
  if (handlers.length === 0) return out;

  const topLevel = topLevelRanges(doc);
  const helpers = boundingHelpers(doc);

  for (const handler of handlers) {
    const kind = classifyPaths(handler.paths);
    if (!kind.ready && !kind.live) continue;
    const line = lineAt(doc, handler.index);
    const body = handler.body;
    const calls = callSites(doc, body);
    const probes = calls.filter((c) => isProbeCall(c.callee));
    const bodyText = maskedText(doc, body);
    const strings = stringsIn(doc, body).map((s) => s.text);
    const codes = statusCodesIn(doc, body);

    if (kind.ready && kind.live) {
      out.push(finding('health-liveness-and-readiness-shared', 'medium', line,
        `one handler is registered at ${handler.paths.join(' and ')}`));
    }

    if (kind.ready && probes.length === 0 && respondsSuccessfully(doc, body)) {
      out.push(finding('health-ignores-dependencies', 'high', line,
        'the handler answers successfully without probing any dependency'));
    }

    const unbounded = probes.filter((p) => !probeIsBounded(doc, body, p, helpers));
    if (unbounded.length > 0) {
      out.push(finding('health-no-dependency-timeout', 'medium', lineAt(doc, unbounded[0].index),
        `${unbounded[0].callee} is awaited with no timeout`));
    }

    for (const tc of tryCatches(doc, body)) {
      if (!tc.catchBody) continue;
      const tryProbes = callSites(doc, tc.tryBody).filter((c) => isProbeCall(c.callee));
      if (tryProbes.length === 0) continue;
      const catchCodes = statusCodesIn(doc, tc.catchBody);
      const failing = catchCodes.some((c) => c.code >= 400);
      if (!failing && respondsSuccessfully(doc, tc.catchBody)) {
        out.push(finding('health-swallows-dependency-error', 'high', lineAt(doc, tc.catchBody.start),
          'the catch block still produces a successful response'));
      }
    }

    const saysUnhealthy = strings.some((s) => UNHEALTHY_WORDS.some((w) => s.toLowerCase().includes(w)));
    const onlyOk = codes.length > 0 && codes.every((c) => c.code >= 200 && c.code < 300);
    const noCodes = codes.length === 0;
    if (saysUnhealthy && (onlyOk || noCodes) && respondsSuccessfully(doc, body)) {
      out.push(finding('health-degraded-with-ok-status', 'high', line,
        'the body can report a problem while the status code stays successful'));
    }

    const secret = strings.find((s) => /:\/\/[^/\s]*:[^/\s]*@/.test(s))
      || (bodyText.match(new RegExp(`\\b(${SECRET_KEYS.join('|')})\\b`, 'i')) || [null])[0];
    if (secret) {
      out.push(finding('health-leaks-internal-detail', 'high', line,
        'the response body carries a credential or a connection string'));
    } else {
      const detail = DETAIL_SIGNS.find((d) => bodyText.includes(d));
      if (detail) {
        out.push(finding('health-leaks-internal-detail', 'medium', line,
          `the response body carries ${detail}`));
      }
    }

    const writes = calls.filter((c) => isWriteCall(c.callee));
    if (writes.length > 0) {
      out.push(finding('health-writes-on-every-call', 'low', lineAt(doc, writes[0].index),
        `${writes[0].callee} writes on every request`));
    }

    if (kind.readiness && !kind.live) {
      const mentionsFlag = READY_FLAGS.some((f) => new RegExp(`\\b${f}\\b`, 'i').test(bodyText));
      if (!mentionsFlag && respondsSuccessfully(doc, body)) {
        out.push(finding('health-readiness-ignores-warmup', 'medium', line,
          'readiness answers without consulting a warmup flag'));
      }
    }

    const firstProbe = probes.length > 0 ? probes[0].index : Number.MAX_SAFE_INTEGER;
    const refusal = codes.find((c) => (c.code === 401 || c.code === 403) && c.index < firstProbe);
    if (refusal) {
      out.push(finding('health-endpoint-requires-auth', 'medium', lineAt(doc, refusal.index),
        `the handler answers ${refusal.code} before probing anything`));
    }

    // A cached result is a module level binding assigned inside the handler and
    // returned on a later request. Without a stored time there is nothing that
    // could expire it.
    const cacheAssign = /\b(cached|cache|lastResult|memo|snapshot)\s*=/.exec(bodyText);
    if (cacheAssign) {
      const declaredAtTop = topLevel.some((r) => new RegExp(`\\b(let|var)\\s+(cached|cache|lastResult|memo|snapshot)\\b`).test(doc.masked.slice(r.start, r.end)));
      const hasExpiry = /Date\.now|ttl|expires|maxAge|staleAt|performance\.now/i.test(bodyText);
      if (declaredAtTop && !hasExpiry) {
        out.push(finding('health-result-cached-without-expiry', 'medium', lineAt(doc, body.start + cacheAssign.index),
          'the memoised result has nothing that could expire it'));
      }
    }
  }

  return out;
}
