import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, parseConf, durationMs, bareDurationKeys, hostOf, SHAPES } from '../src/scan/conf.mjs';

test('a document is recognised by its top level keys', () => {
  assert.equal(classify({ checks: [] }), 'checks');
  assert.equal(classify({ alerts: [] }), 'alerts');
  assert.equal(classify({ findings: [] }), 'baseline');
});

test('checks win over alerts when a document declares both', () => {
  assert.equal(classify({ alerts: [], checks: [] }), 'checks');
});

test('anything else is unknown rather than guessed at', () => {
  for (const value of [null, 1, 'text', [], { monitoring: { checks: [] } }, {}]) {
    assert.equal(classify(value), 'unknown');
  }
});

test('every recognised shape is in the documented list', () => {
  for (const shape of ['checks', 'alerts', 'baseline']) {
    assert.ok(SHAPES.includes(shape));
  }
});

test('unreadable JSON is reported rather than thrown', () => {
  const result = parseConf('{ not json');
  assert.equal(result.ok, false);
  assert.ok(result.error.length > 0);
});

test('a duration is read from a key that carries its unit', () => {
  assert.deepEqual(durationMs({ intervalMs: 500 }, ['interval']), { key: 'intervalMs', ms: 500 });
  assert.deepEqual(durationMs({ intervalSeconds: 5 }, ['interval']), { key: 'intervalSeconds', ms: 5000 });
  assert.deepEqual(durationMs({ intervalMinutes: 2 }, ['interval']), { key: 'intervalMinutes', ms: 120000 });
  assert.deepEqual(durationMs({ intervalHours: 1 }, ['interval']), { key: 'intervalHours', ms: 3600000 });
});

test('a duration with no unit in its key is not read', () => {
  assert.equal(durationMs({ interval: 60 }, ['interval']), null);
  assert.deepEqual(bareDurationKeys({ interval: 60 }, ['interval']), ['interval']);
});

test('a duration that is not a finite number is not read', () => {
  assert.equal(durationMs({ intervalMs: 'soon' }, ['interval']), null);
  assert.equal(durationMs({ intervalMs: Infinity }, ['interval']), null);
});

test('the first base name that carries a unit wins', () => {
  const value = durationMs({ everyMs: 100, intervalMs: 200 }, ['interval', 'every']);
  assert.equal(value.key, 'intervalMs');
});

test('a host and its scheme are read from a URL', () => {
  assert.deepEqual(hostOf('https://shop.example.com/basket'), { scheme: 'https', host: 'shop.example.com' });
  assert.deepEqual(hostOf('HTTP://Shop.Example.com'), { scheme: 'http', host: 'shop.example.com' });
  assert.equal(hostOf('not a url'), null);
  assert.equal(hostOf(undefined), null);
});
