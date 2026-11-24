import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml } from '../src/scan/yaml.mjs';
import { cronPeriodMs } from '../src/checks/runner.mjs';

test('a block mapping is read', () => {
  const { value } = parseYaml('name: CI\nruns-on: ubuntu-latest\n');
  assert.deepEqual(value, { name: 'CI', 'runs-on': 'ubuntu-latest' });
});

test('nesting is read from indentation', () => {
  const { value } = parseYaml('a:\n  b:\n    c: 1\n');
  assert.deepEqual(value, { a: { b: { c: 1 } } });
});

test('a block sequence of scalars is read', () => {
  const { value } = parseYaml('branches:\n  - main\n  - release\n');
  assert.deepEqual(value, { branches: ['main', 'release'] });
});

test('a block sequence of mappings is read, including keys on the dash line', () => {
  const { value } = parseYaml([
    'steps:',
    '  - name: one',
    '    run: echo one',
    '  - name: two',
    '    run: echo two',
  ].join('\n'));
  assert.deepEqual(value.steps, [
    { name: 'one', run: 'echo one' },
    { name: 'two', run: 'echo two' },
  ]);
});

test('booleans, numbers and null are converted', () => {
  const { value } = parseYaml('a: true\nb: false\nc: 12\nd: 1.5\ne: null\n');
  assert.deepEqual(value, { a: true, b: false, c: 12, d: 1.5, e: null });
});

test('a quoted scalar keeps its text and is not converted', () => {
  const { value } = parseYaml("a: 'true'\nb: \"12\"\n");
  assert.deepEqual(value, { a: 'true', b: '12' });
});

test('a comment is removed and a hash inside quotes is not', () => {
  const { value } = parseYaml("group: '#ops'   # the channel\n");
  assert.deepEqual(value, { group: '#ops' });
});

test('a key with no value and no children is null', () => {
  const { value } = parseYaml('workflow_dispatch:\n');
  assert.deepEqual(value, { workflow_dispatch: null });
});

test('a flow collection is reported as unread rather than guessed at', () => {
  const { value, unread } = parseYaml('steps: [one, two]\n');
  assert.equal(value.steps, null);
  assert.equal(unread.length, 1);
  assert.equal(unread[0].reason, 'flow collection');
});

test('a block scalar is reported as unread and its body is not read as keys', () => {
  const { value, unread } = parseYaml('run: |\n  line one\n  line two\nname: after\n');
  assert.equal(value.run, null);
  assert.equal(value.name, 'after');
  assert.ok(unread.some((u) => u.reason === 'block scalar'));
});

test('a value containing a colon followed by a non space is not split', () => {
  const { value } = parseYaml('image: node:20.18.1\n');
  assert.deepEqual(value, { image: 'node:20.18.1' });
});

test('an empty document reads as an empty mapping', () => {
  const { value } = parseYaml('\n\n');
  assert.deepEqual(value, {});
});

const CRON_CASES = [
  ['*/5 * * * *', 300000],
  ['*/1 * * * *', 60000],
  ['* * * * *', 60000],
  ['0 * * * *', 3600000],
  ['30 * * * *', 3600000],
  ['0 */4 * * *', 14400000],
  ['0 3 * * *', 86400000],
  ['@hourly', null],
  ['0 * * * 1', null],
  ['0 0 1 * *', null],
  ['0 * * * * *', null],
  ['', null],
];

test('a five field cron expression gives a period and anything else gives none', () => {
  for (const [expression, expected] of CRON_CASES) {
    assert.equal(cronPeriodMs(expression), expected, expression);
  }
});

test('a cron expression that is not a string gives no period', () => {
  assert.equal(cronPeriodMs(undefined), null);
  assert.equal(cronPeriodMs(5), null);
});
