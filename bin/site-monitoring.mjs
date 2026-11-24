#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { run } from '../src/cli.mjs';
import { auditAll } from '../src/audit.mjs';
import { renderText, renderJson } from '../src/report.mjs';

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  process.exitCode = run(
    { argv: process.argv.slice(2), out: process.stdout, err: process.stderr, fs },
    { auditAll, renderText, renderJson },
  );
}
