// Area F: the scheduled runner.
//
// A workflow is treated as a monitoring runner when it has a schedule and a
// step that runs something monitoring shaped. A workflow carrying syntax the
// reader does not understand is reported as unread rather than judged, and the
// omissions that change an answer here are declared limits.

import { finding } from '../finding.mjs';
import { parseYaml } from '../scan/yaml.mjs';

const MONITOR_TOKENS = /(site-monitoring|monitor|synthetic|uptime|heartbeat|healthcheck|health-check|probe)/i;
const SHA_REF = /^[0-9a-f]{40}$/;
const UPLOAD_ACTION = /upload-artifact/i;
const INTERVAL_KEYS = ['MONITOR_INTERVAL_MS', 'CHECK_INTERVAL_MS', 'INTERVAL_MS'];

function jobsOf(doc) {
  const jobs = doc && typeof doc.jobs === 'object' && doc.jobs !== null ? doc.jobs : {};
  return Object.entries(jobs).filter(([, job]) => job && typeof job === 'object');
}

function stepsOf(job) {
  return Array.isArray(job.steps) ? job.steps.filter((s) => s && typeof s === 'object') : [];
}

function triggersOf(doc) {
  const on = doc ? doc.on : null;
  if (on === null || on === undefined) return {};
  if (typeof on === 'string') return { [on]: null };
  if (Array.isArray(on)) return Object.fromEntries(on.filter((k) => typeof k === 'string').map((k) => [k, null]));
  if (typeof on === 'object') return on;
  return {};
}

/**
 * The period a five field cron expression fires at, in milliseconds, or null
 * when the expression is not of a form this reader handles. Descriptors such as
 * @hourly and expressions with a sixth field are not read, which is a declared
 * limit.
 */
export function cronPeriodMs(expression) {
  if (typeof expression !== 'string') return null;
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minute, hour, dom, month, dow] = fields;
  const everyMinute = (f) => {
    if (f === '*') return 1;
    const step = /^\*\/(\d+)$/.exec(f);
    if (step) return Number(step[1]);
    const list = f.split(',');
    if (list.every((p) => /^\d+$/.test(p))) return list.length === 1 ? null : null;
    return null;
  };
  if (dom !== '*' || month !== '*' || dow !== '*') return null;
  const minuteStep = everyMinute(minute);
  if (minuteStep !== null && hour === '*') return minuteStep * 60000;
  // A fixed minute with a stepped or wildcard hour fires once per hour or per n hours.
  if (/^\d+$/.test(minute)) {
    if (hour === '*') return 3600000;
    const hourStep = /^\*\/(\d+)$/.exec(hour);
    if (hourStep) return Number(hourStep[1]) * 3600000;
    if (/^\d+$/.test(hour)) return 86400000;
  }
  return null;
}

function declaredIntervalMs(doc, jobs) {
  const envs = [doc && doc.env];
  for (const [, job] of jobs) {
    envs.push(job.env);
    for (const step of stepsOf(job)) envs.push(step.env);
  }
  for (const env of envs) {
    if (!env || typeof env !== 'object') continue;
    for (const key of INTERVAL_KEYS) {
      const raw = env[key];
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
      if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw);
    }
  }
  return null;
}

export function checkRunner(input) {
  const parsed = parseYaml(input.text);
  const doc = parsed.value;
  const out = [];
  if (!doc || typeof doc !== 'object') return out;

  const jobs = jobsOf(doc);
  const triggers = triggersOf(doc);
  const hasSchedule = Object.prototype.hasOwnProperty.call(triggers, 'schedule');
  const allRuns = jobs.flatMap(([, job]) => stepsOf(job).map((s) => `${s.name ?? ''} ${s.run ?? ''} ${s.uses ?? ''}`));
  const looksLikeMonitor = hasSchedule && allRuns.some((t) => MONITOR_TOKENS.test(t));
  if (!looksLikeMonitor) return out;

  // Only the jobs that actually run a monitor are judged. A workflow can carry
  // a scheduled tidy up job beside its monitors, and reporting that job for
  // having no timeout is a finding about something this catalogue is not about.
  const monitoringJobs = jobs.filter(([, job]) => stepsOf(job)
    .some((s) => MONITOR_TOKENS.test(`${s.name ?? ''} ${s.run ?? ''} ${s.uses ?? ''}`)));

  for (const [name, job] of monitoringJobs) {
    if (job['continue-on-error'] === true) {
      out.push(finding('runner-continue-on-error', 'high', null,
        `job ${name} is allowed to fail`));
    }
    for (const step of stepsOf(job)) {
      if (step['continue-on-error'] === true) {
        out.push(finding('runner-continue-on-error', 'high', null,
          `step ${step.name ?? step.uses ?? step.run ?? 'unnamed'} is allowed to fail`));
      }
      if (typeof step.run === 'string' && /\$\{\{\s*secrets\./.test(step.run)) {
        out.push(finding('runner-secret-echoed', 'high', null,
          `step ${step.name ?? 'unnamed'} puts a secret on the command line`));
      }
      if (typeof step.uses === 'string') {
        const at = step.uses.lastIndexOf('@');
        const ref = at === -1 ? '' : step.uses.slice(at + 1);
        if (!SHA_REF.test(ref) && !step.uses.startsWith('./')) {
          out.push(finding('runner-unpinned-action', 'low', null,
            `${step.uses} is referenced by a reference that can move`));
        }
      }
    }
    if (job['timeout-minutes'] === undefined || job['timeout-minutes'] === null) {
      out.push(finding('runner-no-job-timeout', 'medium', null,
        `job ${name} declares no timeout`));
    }
  }

  const jobConcurrency = monitoringJobs.some(([, job]) => job.concurrency !== undefined && job.concurrency !== null);
  if ((doc.concurrency === undefined || doc.concurrency === null) && !jobConcurrency) {
    out.push(finding('runner-no-concurrency-guard', 'medium', null,
      'nothing stops two runs of this monitor overlapping'));
  }

  const uploads = monitoringJobs.some(([, job]) => stepsOf(job)
    .some((s) => typeof s.uses === 'string' && UPLOAD_ACTION.test(s.uses)));
  if (!uploads) {
    out.push(finding('runner-no-output-artifact', 'low', null,
      'the run keeps no output beyond the log'));
  }

  if (!Object.prototype.hasOwnProperty.call(triggers, 'workflow_dispatch')) {
    out.push(finding('runner-schedule-only', 'medium', null,
      'the workflow can only be started by its schedule'));
  }

  const schedule = Array.isArray(triggers.schedule) ? triggers.schedule : [];
  const periods = schedule
    .map((entry) => (entry && typeof entry === 'object' ? cronPeriodMs(entry.cron) : null))
    .filter((p) => p !== null);
  const interval = declaredIntervalMs(doc, monitoringJobs);
  if (interval !== null && periods.length > 0) {
    const fastest = Math.min(...periods);
    if (fastest > interval) {
      out.push(finding('runner-cron-slower-than-interval', 'high', null,
        `the schedule fires every ${fastest}ms while the run declares a ${interval}ms interval`));
    }
  }

  return out;
}
