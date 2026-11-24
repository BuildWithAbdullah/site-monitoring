// Every decision the command line makes lives here, and it takes its streams,
// its filesystem and the work it does as arguments. bin/site-monitoring.mjs is
// wiring and nothing else, and tools/entry-thin.mjs fails the build if a
// decision moves back into it.

import { AUDITED_EXTENSIONS } from './audit.mjs';
import { exitCodeFor } from './severity.mjs';

export const USAGE = `site-monitoring <path...> [--json] [--quiet]

Audits monitoring configuration and instrumentation.

  <path>     a file, or a directory to walk
  --json     machine readable output
  --quiet    print nothing and answer with the exit code alone

Exit codes
  0  nothing found
  1  findings, none of them high severity
  2  at least one high severity finding
  64 the command line could not be understood`;

export const EXIT_USAGE = 64;

const SKIP_DIRECTORIES = new Set(['node_modules', '.git', '.github', 'coverage', 'dist', 'build']);

export function parseArgs(argv) {
  const paths = [];
  let json = false;
  let quiet = false;
  for (const arg of argv) {
    if (arg === '--json') { json = true; continue; }
    if (arg === '--quiet') { quiet = true; continue; }
    if (arg === '--help' || arg === '-h') return { help: true, paths, json, quiet };
    if (arg.startsWith('-')) return { error: `unknown option: ${arg}`, paths, json, quiet };
    paths.push(arg);
  }
  if (paths.length === 0) return { error: 'no path given', paths, json, quiet };
  return { paths, json, quiet };
}

function hasAuditedExtension(name) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return false;
  return AUDITED_EXTENSIONS.includes(name.slice(dot).toLowerCase());
}

export function collectFiles(fs, root) {
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) return [root];
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (hasAuditedExtension(entry.name)) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

/**
 * @param {object} io - { argv, out, err, fs }
 * @param {object} work - { auditAll, renderText, renderJson }
 * @returns {number} the exit code
 */
export function run(io, work) {
  const parsed = parseArgs(io.argv);
  if (parsed.help) {
    io.out.write(`${USAGE}\n`);
    return 0;
  }
  if (parsed.error) {
    io.err.write(`${parsed.error}\n\n${USAGE}\n`);
    return EXIT_USAGE;
  }

  const files = [];
  for (const path of parsed.paths) {
    let found;
    try {
      found = collectFiles(io.fs, path);
    } catch (err) {
      io.err.write(`cannot read ${path}: ${err && err.message ? err.message : String(err)}\n`);
      return EXIT_USAGE;
    }
    files.push(...found);
  }

  const inputs = files.map((path) => ({ path, text: io.fs.readFileSync(path, 'utf8') }));
  const results = work.auditAll(inputs);

  if (!parsed.quiet) {
    io.out.write(`${parsed.json ? work.renderJson(results) : work.renderText(results)}\n`);
  }

  return exitCodeFor(results.flatMap((r) => r.findings.map((f) => f.severity)));
}
