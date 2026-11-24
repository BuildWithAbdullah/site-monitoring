// A number stated in prose, matched as a whole line.
//
// A self checking count has to be matched as a whole line rather than by a
// pattern anywhere in the file, and the count of matching lines has to be
// exactly one. Two failures are caught by that and by nothing else: a number
// that has been wrapped onto the next line, which a pattern search still finds
// in pieces, and a number that appears twice, where one copy is updated and the
// other is not.

export function statedOnOneLine(text, build) {
  const lines = text.split('\n');
  const matched = lines.filter((line) => build(line.trim()));
  return { count: matched.length, lines: matched };
}

/**
 * True when `text` states `value` followed by `noun` on exactly one line.
 * The comparison is on the trimmed line, so a wrapped number fails.
 */
export function statesExactly(text, value, noun) {
  const needle = `${value} ${noun}`;
  const { count } = statedOnOneLine(text, (line) => line.includes(needle));
  return count === 1;
}

/** Every line mentioning `noun` at all, so a stale figure can be reported. */
export function linesMentioning(text, noun) {
  return text.split('\n').map((l, i) => ({ line: i + 1, text: l.trim() }))
    .filter((l) => l.text.includes(noun));
}
