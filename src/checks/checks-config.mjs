// Area B: check configuration.
//
// Everything here is arithmetic between declared numbers, which is why the unit
// of every duration has to be legible from its key name. A duration whose key
// carries no unit is not read at all, and that refusal is a declared limit.

import { finding } from '../finding.mjs';
import { durationMs, bareDurationKeys, asArray, hostOf } from '../scan/conf.mjs';

const HTTP_TYPES = ['http', 'https', 'request', undefined, null];
const SAFE_TLS_DAYS = 14;

function checkLabel(check, index) {
  return typeof check.id === 'string' ? check.id : `checks[${index}]`;
}

function alertsFor(doc, id) {
  return asArray(doc.alerts).filter((a) => a && a.check === id);
}

export function checkChecksConfig(conf) {
  const doc = conf.value;
  const out = [];
  const checks = asArray(doc.checks);
  const httpHosts = new Set();
  const dnsHosts = new Set();

  for (const check of checks) {
    if (!check || typeof check !== 'object') continue;
    const parsed = hostOf(check.url);
    if (check.type === 'dns') {
      if (typeof check.host === 'string') dnsHosts.add(check.host.toLowerCase());
      if (parsed) dnsHosts.add(parsed.host);
    } else if (parsed) {
      httpHosts.add(parsed.host);
    }
  }

  checks.forEach((check, index) => {
    if (!check || typeof check !== 'object') return;
    const label = checkLabel(check, index);
    const isHttp = HTTP_TYPES.includes(check.type);
    const interval = durationMs(check, ['interval', 'frequency', 'every', 'period']);
    const timeout = durationMs(check, ['timeout', 'deadline']);
    const backoff = durationMs(check, ['backoff', 'retryDelay', 'retryWait']);
    const bareInterval = bareDurationKeys(check, ['interval', 'frequency', 'every', 'period']);
    const bareTimeout = bareDurationKeys(check, ['timeout', 'deadline']);

    if (isHttp && timeout === null && bareTimeout.length === 0) {
      out.push(finding('check-no-timeout', 'high', null, `${label} declares no timeout`));
    }

    if (timeout && interval) {
      if (timeout.ms > interval.ms) {
        out.push(finding('check-timeout-not-less-than-interval', 'high', null,
          `${label} may run for ${timeout.ms}ms on a ${interval.ms}ms interval, so runs overlap`));
      } else if (timeout.ms === interval.ms) {
        out.push(finding('check-timeout-not-less-than-interval', 'medium', null,
          `${label} has a timeout exactly equal to its interval, leaving no scheduling room`));
      }
    }

    if (interval) {
      for (const alert of alertsFor(doc, check.id)) {
        const window = durationMs(alert, ['window', 'evaluation', 'lookback']);
        if (window && interval.ms > window.ms) {
          out.push(finding('check-interval-exceeds-alert-window', 'high', null,
            `${label} runs every ${interval.ms}ms while an alert evaluates a ${window.ms}ms window`));
          break;
        }
      }
    }

    if (isHttp) {
      const expect = asArray(check.expectStatus);
      const anyRedirect = expect.some((s) => Number(s) >= 300 && Number(s) < 400);
      const followsBlindly = check.followRedirects === true && typeof check.expectFinalUrl !== 'string';
      if (anyRedirect || followsBlindly) {
        out.push(finding('check-accepts-any-redirect', 'medium', null,
          anyRedirect ? `${label} accepts a redirect as a pass` : `${label} follows redirects without asserting where it landed`));
      }

      const asserts = ['expectText', 'expectBody', 'expectJson', 'expectSelector', 'expectHeader'];
      if (!asserts.some((k) => check[k] !== undefined && check[k] !== null && check[k] !== '')) {
        out.push(finding('check-asserts-status-only', 'medium', null,
          `${label} asserts no content, so any 200 passes`));
      }
    }

    const regions = asArray(check.regions ?? check.locations);
    if (regions.length <= 1) {
      out.push(finding('check-single-vantage-point', 'low', null,
        `${label} runs from ${regions.length === 1 ? 'one vantage point' : 'no declared vantage point'}`));
    }

    const retries = Number.isFinite(check.retries) ? check.retries : 0;
    if (retries > 0) {
      if (interval && timeout) {
        // Worst case: every attempt times out, with a backoff between each.
        const attempts = retries + 1;
        const worst = attempts * timeout.ms + retries * (backoff ? backoff.ms : 0);
        if (worst > interval.ms) {
          out.push(finding('check-retries-exceed-interval', 'high', null,
            `${label} can spend ${worst}ms on one sample inside a ${interval.ms}ms interval`));
        }
      }
      if (!backoff || backoff.ms === 0) {
        out.push(finding('check-retries-without-backoff', 'low', null,
          `${label} retries ${retries} times with no backoff`));
      }
    }

    if (parsedScheme(check) === 'http') {
      out.push(finding('check-plain-http-target', 'medium', null, `${label} targets a plain http URL`));
    }

    if (isHttp && parsedScheme(check) === 'https') {
      const days = check.tlsExpiryWarningDays;
      if (days === undefined || days === null) {
        out.push(finding('check-tls-expiry-unmonitored', 'medium', null,
          `${label} is an https target with no certificate warning window`));
      } else if (Number.isFinite(days) && days < SAFE_TLS_DAYS) {
        out.push(finding('check-tls-warning-window-too-short', 'low', null,
          `${label} warns ${days} days before expiry, which is less than a renewal takes`));
      }
    }
  });

  for (const host of httpHosts) {
    if (!dnsHosts.has(host)) {
      out.push(finding('check-dns-unmonitored', 'low', null,
        `${host} is requested but its resolution is never checked on its own`));
      break;
    }
  }

  return out;
}

function parsedScheme(check) {
  const parsed = hostOf(check.url);
  return parsed ? parsed.scheme : null;
}
