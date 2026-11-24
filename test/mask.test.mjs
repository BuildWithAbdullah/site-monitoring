import test from 'node:test';
import assert from 'node:assert/strict';
import { maskSource, readStringAt, stringLiterals, lineOf } from '../src/scan/mask.mjs';

const SAMPLES = [
  { what: 'a single quoted string', source: "const a = 'hello world';" },
  { what: 'a double quoted string', source: 'const a = "hello world";' },
  { what: 'an escaped quote', source: "const a = 'it\\'s here';" },
  { what: 'a line comment', source: 'const a = 1; // a note about it' },
  { what: 'a block comment', source: '/* one\n   two */ const a = 1;' },
  { what: 'a regular expression', source: 'const re = /a\\/b/g;' },
  { what: 'a template literal', source: 'const t = `before ${value} after`;' },
  { what: 'a nested template', source: 'const t = `a ${`b ${c} d`} e`;' },
  { what: 'an unterminated string', source: "const a = 'oops" },
  { what: 'an unterminated block comment', source: 'const a = 1; /* oops' },
  { what: 'a division that is not a regular expression', source: 'const r = total / count / 2;' },
];

test('masking preserves the length of the source', () => {
  for (const sample of SAMPLES) {
    const { masked } = maskSource(sample.source);
    assert.equal(masked.length, sample.source.length, sample.what);
  }
});

test('masking preserves every newline, so line numbers still line up', () => {
  for (const sample of SAMPLES) {
    const { masked } = maskSource(sample.source);
    assert.equal(
      masked.split('\n').length,
      sample.source.split('\n').length,
      sample.what,
    );
  }
});

test('the contents of a string are not readable as code', () => {
  const source = "const a = 'import x from \"./nowhere.mjs\"';";
  const { masked } = maskSource(source);
  assert.ok(!masked.includes('import x'));
  assert.ok(masked.includes("'"), 'the quotes stay, so a string is still visible as a string');
});

test('the contents of a comment are not readable as code', () => {
  const source = 'const a = 1; // window.onerror = handler\n';
  const { masked } = maskSource(source);
  assert.ok(!masked.includes('onerror'));
});

test('the body of a regular expression is blanked and its flags are kept', () => {
  const { masked } = maskSource('const re = /ab+c/gi;');
  assert.ok(masked.includes('/'));
  assert.ok(masked.includes('gi'));
  assert.ok(!masked.includes('ab+c'));
});

test('a substitution inside a template literal is still code', () => {
  const source = 'const t = `path ${location.pathname} end`;';
  const { masked } = maskSource(source);
  assert.ok(masked.includes('location.pathname'));
  assert.ok(!masked.includes('path '));
});

test('the text runs of a template literal are reported as literals', () => {
  const source = 'const t = `one ${x} two`;';
  const { literals } = maskSource(source);
  const texts = stringLiterals(source, literals).map((s) => s.text);
  assert.deepEqual(texts, ['one ', ' two']);
});

test('a value can be read back out of the original source', () => {
  const source = "addEventListener('visibilitychange', handler);";
  const { literals } = maskSource(source);
  const at = source.indexOf('visibilitychange');
  assert.equal(readStringAt(source, literals, at), 'visibilitychange');
});

test('reading a value at an offset that is not inside a string gives nothing', () => {
  const source = "addEventListener('x', handler);";
  const { literals } = maskSource(source);
  assert.equal(readStringAt(source, literals, source.indexOf('handler')), null);
});

test('a division is not read as a regular expression', () => {
  const source = 'const r = total / count / 2;\nconst keep = 1;';
  const { masked } = maskSource(source);
  assert.ok(masked.includes('count'), 'the identifier between the slashes survives');
  assert.ok(masked.includes('keep'));
});

test('a slash after a keyword is read as a regular expression', () => {
  const source = 'const ok = typeof /ab/.exec;';
  const { masked } = maskSource(source);
  assert.ok(!masked.includes('ab'));
});

test('lineOf counts from one', () => {
  const source = 'a\nb\nc';
  assert.equal(lineOf(source, 0), 1);
  assert.equal(lineOf(source, 2), 2);
  assert.equal(lineOf(source, 4), 3);
});

test('masking is stable when applied twice', () => {
  for (const sample of SAMPLES) {
    const once = maskSource(sample.source).masked;
    const twice = maskSource(once).masked;
    assert.equal(twice.length, once.length, sample.what);
  }
});
