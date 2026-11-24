// Area C: alerting and escalation.
//
// Several of these are properties of the document rather than of one alert, and
// they are reported once. An alert that cannot fire and an alert that fires on
// every flap both end in the same place, so both are here.

import { finding } from '../finding.mjs';
import { durationMs, asArray } from '../scan/conf.mjs';

const NO_DATA_HEALTHY = ['ok', 'healthy', 'ignore', 'skip', 'pass', 'good'];
const MEAN_STATISTICS = ['avg', 'mean', 'average'];
const LATENCY_KEYS = ['latencyMs', 'durationMs', 'responseTimeMs', 'ttfbMs'];

function alertLabel(alert, index) {
  return typeof alert.id === 'string' ? alert.id : `alerts[${index}]`;
}

function isHeartbeat(alert) {
  // A malformed document is not a reason to crash. A tool that throws on a
  // trailing comma turned into a null entry is a tool nobody puts in CI.
  if (alert === null || typeof alert !== 'object') return false;
  if (alert.kind === 'heartbeat' || alert.type === 'heartbeat') return true;
  return alert.heartbeat === true;
}

export function checkAlerting(conf) {
  const doc = conf.value;
  const out = [];
  const alerts = asArray(doc.alerts);
  if (alerts.length === 0) return out;

  alerts.forEach((alert, index) => {
    if (!alert || typeof alert !== 'object') return;
    const label = alertLabel(alert, index);

    const consecutive = Number.isFinite(alert.consecutiveFailures)
      ? alert.consecutiveFailures
      : Number.isFinite(alert.forSamples) ? alert.forSamples : null;
    if (consecutive === null || consecutive <= 1) {
      out.push(finding('alert-fires-on-single-sample', 'medium', null,
        `${label} fires on ${consecutive === null ? 'an undeclared number of' : consecutive} failing sample`));
    }

    const onNoData = typeof alert.onNoData === 'string' ? alert.onNoData.toLowerCase() : null;
    if (onNoData === null || NO_DATA_HEALTHY.includes(onNoData)) {
      out.push(finding('alert-no-data-treated-as-healthy', 'high', null,
        `${label} treats an absence of samples as ${onNoData === null ? 'nothing to report' : onNoData}`));
    }

    const dedupe = durationMs(alert, ['dedup', 'dedupWindow', 'group', 'groupWindow', 'repeat']);
    const incident = durationMs(alert, ['incidentBudget', 'incident', 'resolution', 'mttr']);
    if (dedupe && incident && dedupe.ms > incident.ms) {
      out.push(finding('alert-group-window-exceeds-incident', 'medium', null,
        `${label} groups for ${dedupe.ms}ms against an incident budget of ${incident.ms}ms`));
    }

    const receivers = asArray(alert.receivers ?? alert.notify);
    const escalation = asArray(alert.escalation ?? alert.escalations);
    if (receivers.length <= 1 && escalation.length === 0) {
      out.push(finding('alert-no-escalation', 'medium', null,
        `${label} has ${receivers.length} receiver and no escalation step`));
    }

    const statistic = typeof alert.statistic === 'string' ? alert.statistic.toLowerCase() : null;
    const objective = alert.objective && typeof alert.objective === 'object' ? alert.objective : {};
    const measuresLatency = LATENCY_KEYS.some((k) => objective[k] !== undefined)
      || alert.kind === 'latency' || alert.type === 'latency';
    if (measuresLatency && statistic !== null && MEAN_STATISTICS.includes(statistic)) {
      out.push(finding('alert-threshold-on-mean', 'medium', null,
        `${label} thresholds the ${statistic} of a latency objective`));
    }

    const severity = typeof alert.severity === 'string' ? alert.severity.toLowerCase() : null;
    if (severity === null) {
      out.push(finding('alert-severity-inferred-from-name', 'medium', null,
        `${label} declares no severity`));
    } else if (severity === 'high' || severity === 'critical' || severity === 'page') {
      const runbook = alert.runbook ?? alert.runbookUrl ?? alert.playbook;
      if (typeof runbook !== 'string' || runbook === '') {
        out.push(finding('alert-missing-runbook', 'low', null,
          `${label} pages somebody and carries no runbook`));
      }
    }

    if (alert.notifyOnRecovery !== true && alert.notifyResolved !== true) {
      out.push(finding('alert-no-recovery-notification', 'low', null,
        `${label} never announces recovery`));
    }
  });

  if (!alerts.some(isHeartbeat)) {
    out.push(finding('alert-pipeline-unmonitored', 'high', null,
      'no alert fires when the monitor itself stops reporting'));
  }

  const windows = asArray(doc.maintenanceWindows ?? doc.maintenance ?? doc.silences);
  if (windows.length === 0) {
    out.push(finding('alert-no-maintenance-window', 'low', null,
      'the document declares no way to silence alerts during planned work'));
  }

  return out;
}
