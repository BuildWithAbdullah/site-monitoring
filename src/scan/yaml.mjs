// A reader for the subset of YAML that workflow files are written in.
//
// Block mappings, block sequences and plain or quoted scalars, with comments
// removed outside quotes. Flow collections, block scalars, anchors, aliases,
// tags and multiple documents are not read, and each of those omissions that
// changes an answer in area F is a declared limit with artefacts behind it.
//
// This exists because the repository has no dependencies, which is what makes
// a red build mean something. The price is paid in writing the limits down.

function stripComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) {
      const before = i === 0 ? ' ' : line[i - 1];
      if (before === ' ' || before === '\t' || i === 0) return line.slice(0, i);
    }
  }
  return line;
}

function scalar(raw) {
  const text = raw.trim();
  if (text === '') return null;
  if (
    (text.startsWith("'") && text.endsWith("'") && text.length > 1) ||
    (text.startsWith('"') && text.endsWith('"') && text.length > 1)
  ) {
    return text.slice(1, -1);
  }
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null' || text === '~') return null;
  if (/^-?\d+$/.test(text)) return Number(text);
  if (/^-?\d*\.\d+$/.test(text)) return Number(text);
  return text;
}

function isFlow(text) {
  const t = text.trim();
  return (t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}'));
}

function isBlockScalarHeader(text) {
  return /^[|>][-+]?\d*$/.test(text.trim());
}

/**
 * Returns { ok, value, unread } where `unread` lists the line numbers carrying
 * syntax this reader does not understand. A caller that cares about
 * completeness can refuse to judge a document with anything in `unread`.
 */
export function parseYaml(text) {
  const rawLines = text.split('\n');
  const unread = [];
  const lines = [];
  rawLines.forEach((raw, i) => {
    const line = stripComment(raw).replace(/\s+$/, '');
    if (line.trim() === '') return;
    if (line.trim() === '---' || line.trim() === '...') {
      unread.push({ line: i + 1, reason: 'document marker' });
      return;
    }
    const indent = line.length - line.replace(/^\s*/, '').length;
    lines.push({ indent, text: line.trim(), line: i + 1 });
  });

  let index = 0;

  function parseBlock(indent) {
    if (index >= lines.length) return null;
    if (lines[index].text.startsWith('- ') || lines[index].text === '-') {
      return parseSequence(indent);
    }
    return parseMapping(indent);
  }

  function parseSequence(indent) {
    const out = [];
    while (index < lines.length && lines[index].indent === indent && (lines[index].text.startsWith('- ') || lines[index].text === '-')) {
      const current = lines[index];
      const rest = current.text === '-' ? '' : current.text.slice(2).trim();
      index += 1;
      if (rest === '') {
        const next = index < lines.length && lines[index].indent > indent ? parseBlock(lines[index].indent) : null;
        out.push(next);
        continue;
      }
      const kv = splitKey(rest);
      if (kv) {
        // An item that is itself a mapping, whose first key sits on the dash
        // line. Its siblings are indented to the position of that first key.
        const itemIndent = indent + 2;
        const item = {};
        applyKey(item, kv, itemIndent, current.line);
        while (index < lines.length && lines[index].indent >= itemIndent && !lines[index].text.startsWith('- ')) {
          if (lines[index].indent !== itemIndent) {
            if (lines[index].indent > itemIndent) { index += 1; continue; }
            break;
          }
          const inner = splitKey(lines[index].text);
          if (!inner) { unread.push({ line: lines[index].line, reason: 'unreadable line' }); index += 1; continue; }
          const at = lines[index];
          index += 1;
          applyKey(item, inner, itemIndent, at.line);
        }
        out.push(item);
        continue;
      }
      if (isFlow(rest)) {
        unread.push({ line: current.line, reason: 'flow collection' });
        out.push(null);
        continue;
      }
      out.push(scalar(rest));
    }
    return out;
  }

  function applyKey(target, kv, indent, lineNo) {
    const { key, rest } = kv;
    if (rest === '') {
      if (index < lines.length && lines[index].indent > indent) {
        target[key] = parseBlock(lines[index].indent);
      } else {
        target[key] = null;
      }
      return;
    }
    if (isBlockScalarHeader(rest)) {
      unread.push({ line: lineNo, reason: 'block scalar' });
      // Skip the block body so its lines are not read as mapping keys.
      while (index < lines.length && lines[index].indent > indent) index += 1;
      target[key] = null;
      return;
    }
    if (isFlow(rest)) {
      unread.push({ line: lineNo, reason: 'flow collection' });
      target[key] = null;
      return;
    }
    target[key] = scalar(rest);
  }

  function parseMapping(indent) {
    const out = {};
    while (index < lines.length && lines[index].indent === indent) {
      if (lines[index].text.startsWith('- ')) break;
      const kv = splitKey(lines[index].text);
      if (!kv) {
        unread.push({ line: lines[index].line, reason: 'unreadable line' });
        index += 1;
        continue;
      }
      const at = lines[index];
      index += 1;
      applyKey(out, kv, indent, at.line);
    }
    return out;
  }

  function splitKey(text) {
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === "'" && !inDouble) inSingle = !inSingle;
      else if (ch === '"' && !inSingle) inDouble = !inDouble;
      else if (ch === ':' && !inSingle && !inDouble) {
        const after = text[i + 1];
        if (after === undefined || after === ' ') {
          const rawKey = text.slice(0, i).trim();
          const key = (rawKey.startsWith("'") && rawKey.endsWith("'")) || (rawKey.startsWith('"') && rawKey.endsWith('"'))
            ? rawKey.slice(1, -1)
            : rawKey;
          return { key, rest: text.slice(i + 1).trim() };
        }
      }
    }
    return null;
  }

  if (lines.length === 0) return { ok: true, value: {}, unread };
  const value = parseBlock(lines[0].indent);
  return { ok: true, value, unread };
}
