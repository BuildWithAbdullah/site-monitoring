// Dispatch.
//
// A file is routed by its extension, and a JSON document is routed again by its
// top level keys. Every checker gates itself on whether the file is of the kind
// it judges, so a JavaScript file that is not a journey is not reported as a
// journey that asserts nothing.

import { parseConf } from './scan/conf.mjs';
import { checkHealth } from './checks/health.mjs';
import { checkChecksConfig } from './checks/checks-config.mjs';
import { checkAlerting } from './checks/alerting.mjs';
import { checkRum } from './checks/rum.mjs';
import { checkSynthetic } from './checks/synthetic.mjs';
import { checkRunner } from './checks/runner.mjs';
import { checkBaselineDocument, checkDiffScript } from './checks/baseline.mjs';
import { dedupe } from './finding.mjs';
import { sortTokens } from './severity.mjs';

export const JS_EXTENSIONS = ['.js', '.mjs', '.cjs'];
export const CONF_EXTENSIONS = ['.json'];
export const WORKFLOW_EXTENSIONS = ['.yml', '.yaml'];
export const AUDITED_EXTENSIONS = [...JS_EXTENSIONS, ...CONF_EXTENSIONS, ...WORKFLOW_EXTENSIONS];

export const INPUT_KINDS = [
  { id: 'javascript', what: 'health handlers, instrumentation, journeys and diff scripts' },
  { id: 'checks-config', what: 'a JSON document declaring checks' },
  { id: 'alerts-config', what: 'a JSON document declaring alerts' },
  { id: 'baseline', what: 'a JSON document recording a previous run' },
  { id: 'workflow', what: 'the YAML workflow that runs the monitors' },
];

function extensionOf(path) {
  const base = path.split(/[\\/]/).pop() ?? path;
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot).toLowerCase();
}

/**
 * Audits one file. Returns { path, kind, findings, note } where `kind` is null
 * when the file was not audited and `note` says why.
 */
export function auditFile(input) {
  const ext = extensionOf(input.path);
  if (JS_EXTENSIONS.includes(ext)) {
    const findings = [
      ...checkHealth(input),
      ...checkRum(input),
      ...checkSynthetic(input),
      ...checkDiffScript(input),
    ];
    return { path: input.path, kind: 'javascript', findings: dedupe(findings), note: null };
  }
  if (CONF_EXTENSIONS.includes(ext)) {
    const conf = parseConf(input.text);
    if (!conf.ok) {
      return { path: input.path, kind: null, findings: [], note: `not valid JSON: ${conf.error}` };
    }
    if (conf.shape === 'checks') {
      const findings = [...checkChecksConfig(conf), ...checkAlerting(conf)];
      return { path: input.path, kind: 'checks-config', findings: dedupe(findings), note: null };
    }
    if (conf.shape === 'alerts') {
      return { path: input.path, kind: 'alerts-config', findings: dedupe(checkAlerting(conf)), note: null };
    }
    if (conf.shape === 'baseline') {
      return { path: input.path, kind: 'baseline', findings: dedupe(checkBaselineDocument(conf)), note: null };
    }
    return {
      path: input.path,
      kind: null,
      findings: [],
      note: 'no recognised top level key, so the document was not audited',
    };
  }
  if (WORKFLOW_EXTENSIONS.includes(ext)) {
    return { path: input.path, kind: 'workflow', findings: dedupe(checkRunner(input)), note: null };
  }
  return { path: input.path, kind: null, findings: [], note: `${ext || 'no extension'} is not an audited kind` };
}

export function auditAll(inputs) {
  return inputs.map(auditFile);
}

export function tokensOf(results) {
  const tokens = new Set();
  for (const result of results) {
    for (const f of result.findings) tokens.add(`${f.id}@${f.severity}`);
  }
  return sortTokens(tokens);
}

export function severitiesOf(results) {
  return results.flatMap((r) => r.findings.map((f) => f.severity));
}
