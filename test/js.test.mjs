import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepare, callSites, declaredFunctions, tryCatches, balancedRange,
  topLevelRanges, inAnyRange, functionBodyAt, stringArgs, maskedText, lineAt,
} from '../src/scan/js.mjs';

test('a call site carries its dotted callee and its argument range', () => {
  const doc = prepare('db.pool.query("select 1");');
  const calls = callSites(doc);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].callee, 'db.pool.query');
  assert.equal(maskedText(doc, calls[0].args).trim(), '"        "', 'the eight characters of the query are blanked and the quotes stay');
});

test('a bare keyword followed by a parenthesis is not a call', () => {
  const doc = prepare('if (a) { while (b) { try { c(); } catch (e) { d(); } } }');
  const callees = callSites(doc).map((c) => c.callee);
  assert.deepEqual(callees.sort(), ['c', 'd']);
});

test('the name in a function declaration is not a call', () => {
  const doc = prepare('function handler(req) { return 1; }\nhandler(null);');
  const callees = callSites(doc).map((c) => c.callee);
  assert.deepEqual(callees, ['handler']);
});

test('a call written inside a string is not a call site', () => {
  const doc = prepare("const code = 'db.ping()';\nother();");
  const callees = callSites(doc).map((c) => c.callee);
  assert.deepEqual(callees, ['other']);
});

test('declared functions cover declarations and arrow assignments', () => {
  const doc = prepare([
    'export function one() { return 1; }',
    'const two = () => { return 2; };',
    'const three = async (a, b) => { return a + b; };',
    'const notAFunction = 4;',
  ].join('\n'));
  const names = declaredFunctions(doc).map((f) => f.name).sort();
  assert.deepEqual(names, ['one', 'three', 'two']);
});

test('an exported declaration is marked as exported', () => {
  const doc = prepare('export function one() { return 1; }\nfunction two() { return 2; }');
  const fns = declaredFunctions(doc);
  assert.equal(fns.find((f) => f.name === 'one').exported, true);
  assert.equal(fns.find((f) => f.name === 'two').exported, false);
});

test('a balanced range stops at the matching bracket', () => {
  const doc = prepare('f(g(1), [2, 3]);');
  const open = doc.masked.indexOf('(');
  const range = balancedRange(doc, open);
  assert.equal(maskedText(doc, range), 'g(1), [2, 3]');
});

test('an unbalanced bracket gives nothing rather than running to the end', () => {
  const doc = prepare('f(g(1);');
  assert.equal(balancedRange(doc, doc.masked.indexOf('(')), null);
});

test('a try block and its catch block are found together', () => {
  const doc = prepare('try { a(); } catch (err) { b(); }');
  const found = tryCatches(doc);
  assert.equal(found.length, 1);
  assert.deepEqual(callSites(doc, found[0].tryBody).map((c) => c.callee), ['a']);
  assert.deepEqual(callSites(doc, found[0].catchBody).map((c) => c.callee), ['b']);
});

test('a try with a finally and no catch reports no catch block', () => {
  const doc = prepare('try { a(); } finally { b(); }');
  const found = tryCatches(doc);
  assert.equal(found.length, 1);
  assert.equal(found[0].catchBody, null);
});

test('top level ranges exclude the bodies of declared functions', () => {
  const doc = prepare('function f() { inside(); }\noutside();');
  const ranges = topLevelRanges(doc);
  const inside = callSites(doc).find((c) => c.callee === 'inside');
  const outside = callSites(doc).find((c) => c.callee === 'outside');
  assert.equal(inAnyRange(ranges, inside.index), false);
  assert.equal(inAnyRange(ranges, outside.index), true);
});

test('a function body is found for an arrow, a function expression and a concise arrow', () => {
  const forms = [
    'f(0, (a) => { body(); });',
    'f(0, function (a) { body(); });',
    'f(0, async (a) => { body(); });',
  ];
  for (const source of forms) {
    const doc = prepare(source);
    const call = callSites(doc).find((c) => c.callee === 'f');
    const comma = doc.masked.indexOf(',', call.args.start);
    const body = functionBodyAt(doc, comma + 1, call.args.end);
    assert.ok(body, source);
    assert.ok(maskedText(doc, body).includes('body()'), source);
  }
});

test('an identifier in a function slot has no body of its own', () => {
  const doc = prepare('f(0, handler);');
  const call = callSites(doc).find((c) => c.callee === 'f');
  const comma = doc.masked.indexOf(',', call.args.start);
  assert.equal(functionBodyAt(doc, comma + 1, call.args.end), null);
});

test('string arguments are read from the original source', () => {
  const doc = prepare("app.get('/healthz', handler);");
  const call = callSites(doc).find((c) => c.callee === 'app.get');
  assert.deepEqual(stringArgs(doc, call), ['/healthz']);
});

test('a line number is reported from the original source', () => {
  const doc = prepare('a();\n\nb();');
  const b = callSites(doc).find((c) => c.callee === 'b');
  assert.equal(lineAt(doc, b.index), 3);
});
