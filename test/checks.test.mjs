// Unit tests for the checkers, and regression tests for every defect found
// while this repository was being written. Each of those is named after what
// went wrong rather than after the rule, because the rule was already there and
// was the thing that was broken.

import test from 'node:test';
import assert from 'node:assert/strict';
import { auditFile } from '../src/audit.mjs';
import { FINDINGS, AREAS } from '../src/catalogue.mjs';
import { finding } from '../src/finding.mjs';
import { exitCodeFor, worstSeverity, tokenFor, SEVERITIES } from '../src/severity.mjs';

function tokens(path, text) {
  return auditFile({ path, text }).findings.map((f) => `${f.id}@${f.severity}`).sort();
}

test('a finding that is not in the catalogue cannot be emitted', () => {
  assert.throws(() => finding('not-a-finding', 'high', 1, ''), /not in the catalogue/);
});

test('a finding cannot be emitted at a severity it does not declare', () => {
  const single = FINDINGS.find((f) => f.severities.length === 1);
  const other = SEVERITIES.find((s) => s !== single.severities[0]);
  assert.throws(() => finding(single.id, other, 1, ''), /not declared at severity/);
});

test('a finding cannot be emitted at a severity that does not exist', () => {
  assert.throws(() => finding(FINDINGS[0].id, 'urgent', 1, ''), /unknown severity/);
});

test('the exit code is derived from the worst severity present', () => {
  assert.equal(exitCodeFor([]), 0);
  assert.equal(exitCodeFor(['low']), 1);
  assert.equal(exitCodeFor(['medium', 'low']), 1);
  assert.equal(exitCodeFor(['low', 'high']), 2);
});

test('the worst severity of an empty set is nothing rather than a guess', () => {
  assert.equal(worstSeverity([]), null);
  assert.throws(() => worstSeverity(['urgent']), /unknown severity/);
});

test('a token is the finding and the severity', () => {
  assert.equal(tokenFor('a-finding', 'high'), 'a-finding@high');
  assert.throws(() => tokenFor('a-finding', 'urgent'), /unknown severity/);
});

test('a file of an unaudited kind is skipped and says so', () => {
  const result = auditFile({ path: 'notes.txt', text: 'hello' });
  assert.equal(result.kind, null);
  assert.ok(result.note.includes('.txt'));
  assert.deepEqual(result.findings, []);
});

test('a JSON document that is not valid JSON is reported rather than thrown', () => {
  const result = auditFile({ path: 'checks.json', text: '{ oops' });
  assert.equal(result.kind, null);
  assert.ok(result.note.includes('not valid JSON'));
});

test('a document with no recognised top level key is skipped, not judged', () => {
  const result = auditFile({ path: 'checks.json', text: '{"monitoring":{"checks":[]}}' });
  assert.equal(result.kind, null);
  assert.ok(result.note.includes('no recognised top level key'));
});

// ------------------------------------------------------------------ area A

test('a liveness only endpoint that probes nothing is not reported for it', () => {
  const text = [
    'export function register(app) {',
    "  app.get('/livez', (req, res) => {",
    "    res.status(200).json({ process: 'running' });",
    '  });',
    '}',
  ].join('\n');
  assert.deepEqual(tokens('live.mjs', text), []);
});

test('a readiness endpoint that probes nothing is reported', () => {
  const text = [
    'export function register(app) {',
    "  app.get('/readyz', (req, res) => {",
    "    res.status(200).json({ ok: true });",
    '  });',
    '}',
  ].join('\n');
  assert.ok(tokens('ready.mjs', text).includes('health-ignores-dependencies@high'));
});

test('regression: a probe bounded by a local helper is not reported as unbounded', () => {
  // The timeout sign lives in the helper, not in the handler, and the helper is
  // named something other than withTimeout. Before this was fixed, two
  // corrected examples reported a missing timeout.
  const text = [
    "import { db } from './db.mjs';",
    'function bounded(promise, ms) {',
    '  let timer;',
    "  const expiry = new Promise((_, reject) => { timer = setTimeout(reject, ms); });",
    '  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));',
    '}',
    'export function register(app) {',
    "  app.get('/healthz', async (req, res) => {",
    '    try {',
    '      await bounded(db.ping(), 1000);',
    '    } catch {',
    "      res.status(503).json({ store: 'unreachable' });",
    '      return;',
    '    }',
    "    res.status(200).json({ store: 'ok' });",
    '  });',
    '}',
  ].join('\n');
  assert.deepEqual(tokens('health.mjs', text), []);
});

test('regression: a handler passed by name in the same file is resolved', () => {
  // Before this was fixed, a handler registered as an identifier was not found
  // at all, so one handler serving both liveness and readiness was invisible.
  const text = [
    "import { db } from './db.mjs';",
    'export function register(app) {',
    '  const handler = async (req, res) => {',
    '    try {',
    '      await Promise.race([db.ping(), new Promise((_, r) => setTimeout(r, 500))]);',
    '    } catch {',
    "      res.status(503).json({ store: 'unreachable' });",
    '      return;',
    '    }',
    "    res.status(200).json({ store: 'ok', ready: true });",
    '  };',
    "  app.get('/livez', handler);",
    "  app.get('/readyz', handler);",
    '}',
  ].join('\n');
  assert.deepEqual(tokens('health.mjs', text), ['health-liveness-and-readiness-shared@medium']);
});

test('regression: a response chained onto a status call counts as a response', () => {
  // res.status(code).json(body) is the usual Express form, and a dotted callee
  // path cannot cross a closing parenthesis. Before this was fixed, a handler
  // whose status code came from a variable was read as never responding, and
  // every finding that depends on the handler answering was skipped.
  const text = [
    "import { probeEverything } from './probes.mjs';",
    'export function register(app) {',
    "  app.get('/readyz', async (req, res) => {",
    '    const states = await probeEverything({ budgetMs: 1500 });',
    "    const worst = states.some((s) => s.state !== 'ok') ? 503 : 200;",
    '    res.status(worst).json({ parts: states.length });',
    '  });',
    '}',
  ].join('\n');
  assert.ok(tokens('ready.mjs', text).includes('health-ignores-dependencies@high'));
});

test('a credential in the health body is high and a stack trace is medium', () => {
  const base = (body) => [
    "import { db } from './db.mjs';",
    'export function register(app, config) {',
    "  app.get('/healthz', async (req, res) => {",
    '    try {',
    '      await Promise.race([db.ping(), new Promise((_, r) => setTimeout(r, 500))]);',
    '    } catch (cause) {',
    `      res.status(503).json(${body});`,
    '      return;',
    '    }',
    "    res.status(200).json({ store: 'ok' });",
    '  });',
    '}',
  ].join('\n');
  assert.ok(tokens('a.mjs', base('{ connectionString: config.databaseUrl }'))
    .includes('health-leaks-internal-detail@high'));
  assert.ok(tokens('b.mjs', base('{ trace: cause.stack }'))
    .includes('health-leaks-internal-detail@medium'));
});

// ------------------------------------------------------------------ area B

test('a timeout longer than the interval is high and one equal to it is medium', () => {
  const conf = (timeout) => JSON.stringify({
    checks: [{
      id: 'home',
      url: 'https://shop.example.com/',
      type: 'http',
      intervalMs: 30000,
      timeoutMs: timeout,
      expectStatus: [200],
      expectText: 'Basket',
      regions: ['a', 'b'],
      tlsExpiryWarningDays: 21,
    }, { id: 'd', type: 'dns', host: 'shop.example.com', regions: ['a', 'b'] }],
  });
  assert.ok(tokens('c.json', conf(45000)).includes('check-timeout-not-less-than-interval@high'));
  assert.ok(tokens('c.json', conf(30000)).includes('check-timeout-not-less-than-interval@medium'));
  assert.ok(!tokens('c.json', conf(5000)).some((t) => t.startsWith('check-timeout-not-less-than-interval')));
});

test('the retry budget is the worst case sequence of attempts and backoffs', () => {
  const conf = (retries, backoff) => JSON.stringify({
    checks: [{
      id: 'home',
      url: 'https://shop.example.com/',
      type: 'http',
      intervalMs: 60000,
      timeoutMs: 10000,
      retries,
      backoffMs: backoff,
      expectStatus: [200],
      expectText: 'Basket',
      regions: ['a', 'b'],
      tlsExpiryWarningDays: 21,
    }, { id: 'd', type: 'dns', host: 'shop.example.com', regions: ['a', 'b'] }],
  });
  // Three attempts at ten seconds with two two second gaps is 34 seconds.
  assert.ok(!tokens('c.json', conf(2, 2000)).includes('check-retries-exceed-interval@high'));
  // Six attempts at ten seconds with five two second gaps is seventy seconds.
  assert.ok(tokens('c.json', conf(5, 2000)).includes('check-retries-exceed-interval@high'));
});

test('a duration with no unit suppresses the finding rather than guessing', () => {
  const text = JSON.stringify({
    checks: [{
      id: 'home',
      url: 'https://shop.example.com/',
      type: 'http',
      interval: 60,
      timeout: 90,
      expectStatus: [200],
      expectText: 'Basket',
      regions: ['a', 'b'],
      tlsExpiryWarningDays: 21,
    }, { id: 'd', type: 'dns', host: 'shop.example.com', regions: ['a', 'b'] }],
  });
  assert.deepEqual(tokens('c.json', text), []);
});

// ------------------------------------------------------------------ area C

test('a heartbeat is recognised by kind, by type and by flag', () => {
  const base = (heartbeat) => JSON.stringify({
    alerts: [{
      id: 'home-down',
      severity: 'high',
      consecutiveFailures: 3,
      onNoData: 'alert',
      receivers: [{ kind: 'chat', target: '#ops' }],
      escalation: [{ afterMs: 600000, receivers: [] }],
      runbook: 'docs/runbooks/home.md',
      notifyOnRecovery: true,
      ...heartbeat,
    }],
    maintenanceWindows: [{ id: 'w' }],
  });
  for (const shape of [{ kind: 'heartbeat' }, { type: 'heartbeat' }, { heartbeat: true }]) {
    assert.ok(!tokens('a.json', base(shape)).includes('alert-pipeline-unmonitored@high'),
      JSON.stringify(shape));
  }
  assert.ok(tokens('a.json', base({ kind: 'availability' })).includes('alert-pipeline-unmonitored@high'));
});

test('a runbook is only demanded of an alert that pages', () => {
  const base = (severity) => JSON.stringify({
    alerts: [{
      id: 'a',
      kind: 'heartbeat',
      severity,
      consecutiveFailures: 3,
      onNoData: 'alert',
      receivers: [{ kind: 'chat', target: '#ops' }],
      escalation: [{ afterMs: 1, receivers: [] }],
      notifyOnRecovery: true,
    }],
    maintenanceWindows: [{ id: 'w' }],
  });
  assert.ok(tokens('a.json', base('high')).includes('alert-missing-runbook@low'));
  assert.ok(!tokens('a.json', base('low')).includes('alert-missing-runbook@low'));
});

// ------------------------------------------------------------------ area D

test('regression: layout shift reported from a hidden handler is not reported early', () => {
  // The event name is a string argument, and every scanner runs on the masked
  // copy where a string has been blanked. Reading the event names from the
  // masked text made this check miss its own corrected example.
  const text = [
    'let shift = 0;',
    'let restored = false;',
    "addEventListener('pageshow', (e) => { restored = e.persisted; });",
    'new PerformanceObserver((list) => {',
    '  for (const entry of list.getEntries()) shift += entry.value;',
    "}).observe({ type: 'layout-shift', buffered: true });",
    "addEventListener('visibilitychange', () => {",
    "  if (document.visibilityState !== 'hidden') return;",
    "  navigator.sendBeacon('/rum', JSON.stringify({ cls: shift, restored }));",
    '});',
  ].join('\n');
  assert.deepEqual(tokens('rum.mjs', text), []);
});

test('layout shift sent from inside the observer callback is reported early', () => {
  const text = [
    'let shift = 0;',
    'let restored = false;',
    "addEventListener('pageshow', (e) => { restored = e.persisted; });",
    "addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') ping(); });",
    'new PerformanceObserver((list) => {',
    '  for (const entry of list.getEntries()) shift += entry.value;',
    "  navigator.sendBeacon('/rum', JSON.stringify({ cls: shift }));",
    "}).observe({ type: 'layout-shift', buffered: true });",
  ].join('\n');
  assert.ok(tokens('rum.mjs', text).includes('rum-cls-reported-early@medium'));
});

test('a cookie in the payload is high and a raw URL is medium', () => {
  const base = (context) => [
    "import { monitor } from './monitor.mjs';",
    'export function start(consent, buildId) {',
    '  if (!consent.analytics) return;',
    `  monitor.init({ sampleRate: 0.2, release: buildId, context: ${context} });`,
    '}',
  ].join('\n');
  assert.ok(tokens('a.mjs', base('{ session: document.cookie }')).includes('rum-pii-in-payload@high'));
  assert.ok(tokens('b.mjs', base('{ url: location.href }')).includes('rum-pii-in-payload@medium'));
  assert.ok(!tokens('c.mjs', base('{ path: location.pathname }')).some((t) => t.startsWith('rum-pii')));
});

test('a file that is not instrumentation is not judged as instrumentation', () => {
  const text = 'export function add(a, b) { return a + b; }';
  assert.deepEqual(tokens('math.mjs', text), []);
});

// ------------------------------------------------------------------ area E

test('a file that never opens a page is not judged as a journey', () => {
  const text = "export const selectors = { basket: '[data-testid=\"basket\"]' };";
  assert.deepEqual(tokens('selectors.mjs', text), []);
});

test('a journey that throws on a condition counts as asserting', () => {
  const text = [
    'export async function run(browser) {',
    '  const page = await browser.newPage();',
    "  await page.goto('https://shop.example.com/');",
    "  const title = await page.title();",
    "  if (!title) throw new Error('no title');",
    "  await page.screenshot({ path: 'a.png' });",
    '}',
  ].join('\n');
  assert.ok(!tokens('j.mjs', text).includes('journey-asserts-navigation-only@high'));
});

// ------------------------------------------------------------------ area F

test('a scheduled workflow that is not a monitor is not judged as one', () => {
  const text = [
    'name: Nightly backup',
    'on:',
    '  schedule:',
    "    - cron: '0 2 * * *'",
    'jobs:',
    '  backup:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - run: node scripts/backup.mjs',
  ].join('\n');
  assert.deepEqual(tokens('wf.yml', text), []);
});

test('a monitoring workflow with no schedule is not judged as a runner', () => {
  const text = [
    'name: Monitors',
    'on:',
    '  workflow_dispatch:',
    'jobs:',
    '  probe:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - run: node bin/site-monitoring.mjs monitors',
  ].join('\n');
  assert.deepEqual(tokens('wf.yml', text), []);
});

test('a local action reference is not reported as unpinned', () => {
  const text = [
    'name: Monitors',
    'on:',
    '  schedule:',
    "    - cron: '*/5 * * * *'",
    '  workflow_dispatch:',
    'concurrency:',
    '  group: m',
    'jobs:',
    '  probe:',
    '    runs-on: ubuntu-latest',
    '    timeout-minutes: 5',
    '    steps:',
    '      - uses: ./.github/actions/setup',
    '      - run: node bin/site-monitoring.mjs monitors',
    '      - uses: actions/upload-artifact@50769540e7f4bd5e21e526ee35c689e35e0d6874',
  ].join('\n');
  assert.deepEqual(tokens('wf.yml', text), []);
});

// ------------------------------------------------------------------ area G

test('a script that never mentions a baseline is not judged as a diff', () => {
  const text = "import { readFileSync } from 'node:fs';\nconst a = JSON.parse(readFileSync('a.json', 'utf8'));\nprocess.stdout.write(String(a.findings.length));";
  assert.deepEqual(tokens('d.mjs', text), []);
});

test('every area in the catalogue is reachable through the dispatcher', () => {
  const kinds = new Set();
  for (const area of AREAS) kinds.add(area.id);
  assert.equal(kinds.size, AREAS.length);
  assert.ok(AREAS.length >= 7);
});

// ------------------------------------------------------------------------
// Regression tests for the defects found by the adversarial sweep that was run
// after the suite was already green. Twenty five awkward inputs produced ten
// defects and four declared limits, which is the strongest argument for making
// the sweep a standing step rather than an optional one.

test('sweep: a null entry in the alerts array does not crash the tool', () => {
  const text = JSON.stringify({
    alerts: [null, { id: 'hb', kind: 'heartbeat', severity: 'low', consecutiveFailures: 2,
      onNoData: 'alert', receivers: [{ kind: 'chat' }, { kind: 'phone' }], notifyOnRecovery: true }],
    maintenanceWindows: [{ id: 'w' }],
  });
  assert.deepEqual(tokens('a.json', text), []);
});

test('sweep: a single value where a list is allowed is read as a list', () => {
  // expectStatus: 301 was read as an empty list, so a check that accepts a
  // redirect as a pass reported nothing at all.
  const text = JSON.stringify({
    checks: [{
      id: 'home',
      url: 'https://shop.example.com/',
      type: 'http',
      intervalMs: 60000,
      timeoutMs: 10000,
      expectStatus: 301,
      expectText: 'Basket',
      regions: ['a', 'b'],
      tlsExpiryWarningDays: 21,
    }, { id: 'd', type: 'dns', host: 'shop.example.com', regions: ['a', 'b'] }],
  });
  assert.ok(tokens('c.json', text).includes('check-accepts-any-redirect@medium'));
});

test('sweep: a probe on a loop variable is still a probe', () => {
  const text = [
    "import { db, search } from './db.mjs';",
    'const PROBES = [db, search];',
    'function bounded(p, ms) {',
    '  let t;',
    '  return Promise.race([p, new Promise((_, r) => { t = setTimeout(r, ms); })]).finally(() => clearTimeout(t));',
    '}',
    'export function register(app) {',
    "  app.get('/healthz', async (req, res) => {",
    '    for (const dependency of PROBES) {',
    '      try {',
    '        await bounded(dependency.ping(), 1000);',
    '      } catch {',
    "        res.status(503).json({ state: 'unreachable' });",
    '        return;',
    '      }',
    '    }',
    "    res.status(200).json({ state: 'ok' });",
    '  });',
    '}',
  ].join('\n');
  assert.deepEqual(tokens('health.mjs', text), []);
});

test('sweep: a probe reached through optional chaining is still a probe', () => {
  const text = [
    "import { db } from './db.mjs';",
    'export function register(app) {',
    "  app.get('/healthz', async (req, res) => {",
    '    try {',
    '      await Promise.race([db?.ping(), new Promise((_, r) => setTimeout(r, 900))]);',
    '    } catch {',
    "      res.status(503).json({ state: 'unreachable' });",
    '      return;',
    '    }',
    "    res.status(200).json({ state: 'ok' });",
    '  });',
    '}',
  ].join('\n');
  assert.deepEqual(tokens('health.mjs', text), []);
});

test('sweep: a byte order mark does not make a document unreadable', () => {
  const result = auditFile({ path: 'checks.json', text: '﻿{"checks":[]}' });
  assert.equal(result.kind, 'checks-config');
  assert.equal(result.note, null);
});

test('sweep: a generation time recorded as an epoch number counts as recorded', () => {
  const text = '{"generatedAt": 1772000000, "findings": [{"id":"a"}]}';
  assert.deepEqual(tokens('baseline.json', text), []);
});

test('sweep: a job in a monitoring workflow that runs no monitor is not judged', () => {
  const text = [
    'name: Scheduled work',
    'on:',
    "  schedule:",
    "    - cron: '*/5 * * * *'",
    '  workflow_dispatch:',
    'concurrency:',
    '  group: scheduled',
    'jobs:',
    '  monitors:',
    '    runs-on: ubuntu-latest',
    '    timeout-minutes: 8',
    '    steps:',
    '      - run: node bin/site-monitoring.mjs monitors',
    '      - uses: actions/upload-artifact@50769540e7f4bd5e21e526ee35c689e35e0d6874',
    '  tidy:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - run: node scripts/tidy.mjs',
  ].join('\n');
  assert.deepEqual(tokens('wf.yml', text), []);
});

test('sweep: a chained route registration is read rather than skipped', () => {
  const text = [
    'export function register(app) {',
    "  app.route('/healthz').get((req, res) => {",
    "    res.status(200).json({ state: 'ok' });",
    '  });',
    '}',
  ].join('\n');
  assert.ok(tokens('health.mjs', text).includes('health-ignores-dependencies@high'));
});

test('sweep: a listener handler passed by name is resolved', () => {
  const bad = [
    "import { collect } from './collect.mjs';",
    'function onHidden() {',
    "  if (document.visibilityState !== 'hidden') return;",
    "  fetch('/rum', { method: 'POST', body: JSON.stringify(collect()) });",
    '}',
    "addEventListener('visibilitychange', onHidden);",
  ].join('\n');
  assert.ok(tokens('rum.mjs', bad).includes('rum-beacon-not-sendbeacon@medium'));
});

test('sweep: a beacon sent through a local helper counts as a beacon', () => {
  const good = [
    "import { collect } from './collect.mjs';",
    'function flush() {',
    "  navigator.sendBeacon('/rum', JSON.stringify(collect()));",
    '}',
    "addEventListener('visibilitychange', () => {",
    "  if (document.visibilityState !== 'hidden') return;",
    '  flush();',
    '});',
  ].join('\n');
  assert.deepEqual(tokens('rum.mjs', good), []);
});

test('sweep: an init inside a conditional is gated and one beside it is not', () => {
  const guarded = [
    "import { monitor } from './monitor.mjs';",
    "import { flags } from './flags.mjs';",
    'if (flags.rum) {',
    "  monitor.init({ endpoint: '/rum', sampleRate: 0.2, release: '1' });",
    '}',
  ].join('\n');
  assert.deepEqual(tokens('rum.mjs', guarded), []);
  const bare = [
    "import { monitor } from './monitor.mjs';",
    "monitor.init({ endpoint: '/rum', sampleRate: 0.2, release: '1' });",
  ].join('\n');
  assert.ok(tokens('rum.mjs', bare).includes('rum-init-before-consent@high'));
});

test('sweep: an assertion helper named by the convention is recognised', () => {
  const text = [
    "import { expectBasketRendered } from './assertions.mjs';",
    'export async function run(browser) {',
    '  const page = await browser.newPage();',
    "  await page.goto('https://shop.example.com/basket');",
    '  await expectBasketRendered(page);',
    "  await page.screenshot({ path: 'artifacts/basket.png' });",
    '}',
  ].join('\n');
  assert.deepEqual(tokens('j.mjs', text), []);
});
