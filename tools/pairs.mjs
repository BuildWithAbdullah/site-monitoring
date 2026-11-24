// The pair manifest.
//
// Every entry names a failing example, the corrected example beside it, and the
// EXACT set of `id@severity` tokens each side produces. Exact, in both
// directions: a token the run produces that is not listed fails the build, and
// a token listed that the run does not produce fails the build too.
//
// That second direction is what makes the corpus worth having. An inclusion
// assertion hides every false positive the corpus triggers, by construction,
// because a corrected file that still reports something passes a containment
// check. Five of the defects found while this repository was being written were
// found by a corrected file reporting something it should not have.
//
// `residual` is the set a corrected side keeps on purpose. It is stated here so
// that a residual is a decision rather than an oversight, and it is asserted
// exactly like everything else.

export const PAIRS = [
  // ---------------------------------------------- health and readiness
  {
    slug: 'health-static-ok',
    area: 'health-and-readiness',
    before: 'health-static-ok.before.mjs',
    after: 'health-static-ok.after.mjs',
    expected: ['health-ignores-dependencies@high'],
    residual: [],
  },
  {
    slug: 'health-swallowed-error',
    area: 'health-and-readiness',
    before: 'health-swallowed-error.before.mjs',
    after: 'health-swallowed-error.after.mjs',
    expected: ['health-swallows-dependency-error@high', 'health-leaks-internal-detail@medium'],
    residual: [],
  },
  {
    slug: 'health-no-timeout',
    area: 'health-and-readiness',
    before: 'health-no-timeout.before.mjs',
    after: 'health-no-timeout.after.mjs',
    expected: ['health-no-dependency-timeout@medium', 'health-writes-on-every-call@low'],
    residual: [],
  },
  {
    slug: 'health-shared-probes',
    area: 'health-and-readiness',
    before: 'health-shared-probes.before.mjs',
    after: 'health-shared-probes.after.mjs',
    expected: ['health-liveness-and-readiness-shared@medium'],
    residual: [],
  },
  {
    slug: 'health-cached-forever',
    area: 'health-and-readiness',
    before: 'health-cached-forever.before.mjs',
    after: 'health-cached-forever.after.mjs',
    expected: ['health-result-cached-without-expiry@medium', 'health-endpoint-requires-auth@medium'],
    residual: [],
  },
  {
    slug: 'health-readiness-no-warmup',
    area: 'health-and-readiness',
    before: 'health-readiness-no-warmup.before.mjs',
    after: 'health-readiness-no-warmup.after.mjs',
    expected: ['health-readiness-ignores-warmup@medium'],
    residual: [],
  },
  {
    slug: 'health-degraded-200',
    area: 'health-and-readiness',
    before: 'health-degraded-200.before.mjs',
    after: 'health-degraded-200.after.mjs',
    expected: ['health-degraded-with-ok-status@high'],
    residual: [],
  },
  {
    slug: 'health-leaks-dsn',
    area: 'health-and-readiness',
    before: 'health-leaks-dsn.before.mjs',
    after: 'health-leaks-dsn.after.mjs',
    expected: ['health-leaks-internal-detail@high'],
    residual: [],
  },

  // ---------------------------------------------- check configuration
  {
    slug: 'checks-minimal',
    area: 'check-configuration',
    before: 'checks-minimal.before.json',
    after: 'checks-minimal.after.json',
    expected: [
      'check-no-timeout@high',
      'check-asserts-status-only@medium',
      'check-tls-expiry-unmonitored@medium',
      'check-single-vantage-point@low',
      'check-dns-unmonitored@low',
    ],
    residual: [],
  },
  {
    slug: 'checks-timeout-over-interval',
    area: 'check-configuration',
    before: 'checks-timeout-over-interval.before.json',
    after: 'checks-timeout-over-interval.after.json',
    expected: ['check-timeout-not-less-than-interval@high', 'check-retries-exceed-interval@high'],
    residual: [],
  },
  {
    slug: 'checks-timeout-equals-interval',
    area: 'check-configuration',
    before: 'checks-timeout-equals-interval.before.json',
    after: 'checks-timeout-equals-interval.after.json',
    expected: ['check-timeout-not-less-than-interval@medium'],
    residual: [],
  },
  {
    slug: 'checks-interval-over-window',
    area: 'check-configuration',
    before: 'checks-interval-over-window.before.json',
    after: 'checks-interval-over-window.after.json',
    expected: ['check-interval-exceeds-alert-window@high'],
    residual: [],
  },
  {
    slug: 'checks-redirect-and-http',
    area: 'check-configuration',
    before: 'checks-redirect-and-http.before.json',
    after: 'checks-redirect-and-http.after.json',
    expected: ['check-accepts-any-redirect@medium', 'check-plain-http-target@medium'],
    residual: [],
  },
  {
    slug: 'checks-retries-no-backoff',
    area: 'check-configuration',
    before: 'checks-retries-no-backoff.before.json',
    after: 'checks-retries-no-backoff.after.json',
    expected: ['check-retries-without-backoff@low', 'check-tls-warning-window-too-short@low'],
    residual: [],
  },
  {
    // The corrected side keeps one finding on purpose: this endpoint is only
    // reachable from one network, so a second vantage point does not exist to
    // be declared. The residual is stated rather than suppressed.
    slug: 'checks-internal-single-region',
    area: 'check-configuration',
    uniquenessExemptBecause:
      'this pair exists to show a residual being declared rather than suppressed, '
      + 'so it deliberately reaches the same findings as checks-minimal',
    before: 'checks-internal-single-region.before.json',
    after: 'checks-internal-single-region.after.json',
    expected: [
      'check-no-timeout@high',
      'check-asserts-status-only@medium',
      'check-tls-expiry-unmonitored@medium',
      'check-single-vantage-point@low',
      'check-dns-unmonitored@low',
    ],
    residual: ['check-single-vantage-point@low'],
  },

  // ---------------------------------------------- alerting and escalation
  {
    slug: 'alerts-flapping',
    area: 'alerting-and-escalation',
    before: 'alerts-flapping.before.json',
    after: 'alerts-flapping.after.json',
    expected: ['alert-fires-on-single-sample@medium', 'alert-missing-runbook@low'],
    residual: [],
  },
  {
    slug: 'alerts-no-data-ok',
    area: 'alerting-and-escalation',
    before: 'alerts-no-data-ok.before.json',
    after: 'alerts-no-data-ok.after.json',
    expected: ['alert-no-data-treated-as-healthy@high', 'alert-severity-inferred-from-name@medium'],
    residual: [],
  },
  {
    slug: 'alerts-dedupe-window',
    area: 'alerting-and-escalation',
    before: 'alerts-dedupe-window.before.json',
    after: 'alerts-dedupe-window.after.json',
    expected: ['alert-group-window-exceeds-incident@medium', 'alert-no-escalation@medium'],
    residual: [],
  },
  {
    slug: 'alerts-mean-latency',
    area: 'alerting-and-escalation',
    before: 'alerts-mean-latency.before.json',
    after: 'alerts-mean-latency.after.json',
    expected: ['alert-threshold-on-mean@medium', 'alert-no-recovery-notification@low'],
    residual: [],
  },
  {
    slug: 'alerts-no-heartbeat',
    area: 'alerting-and-escalation',
    before: 'alerts-no-heartbeat.before.json',
    after: 'alerts-no-heartbeat.after.json',
    expected: ['alert-pipeline-unmonitored@high', 'alert-no-maintenance-window@low'],
    residual: [],
  },

  // ---------------------------------------------- rum and error reporting
  {
    slug: 'rum-loader-sync',
    area: 'rum-and-error-reporting',
    before: 'rum-loader-sync.before.mjs',
    after: 'rum-loader-sync.after.mjs',
    expected: ['rum-script-blocks-render@high'],
    residual: [],
  },
  {
    slug: 'rum-init-no-sampling',
    area: 'rum-and-error-reporting',
    before: 'rum-init-no-sampling.before.mjs',
    after: 'rum-init-no-sampling.after.mjs',
    expected: ['rum-sample-rate-missing@medium', 'rum-release-not-attached@low'],
    residual: [],
  },
  {
    slug: 'rum-beacon-unload',
    area: 'rum-and-error-reporting',
    before: 'rum-beacon-unload.before.mjs',
    after: 'rum-beacon-unload.after.mjs',
    expected: ['rum-beacon-on-unload@high'],
    residual: [],
  },
  {
    slug: 'rum-beacon-fetch',
    area: 'rum-and-error-reporting',
    before: 'rum-beacon-fetch.before.mjs',
    after: 'rum-beacon-fetch.after.mjs',
    expected: ['rum-beacon-not-sendbeacon@medium'],
    residual: [],
  },
  {
    slug: 'rum-vitals-no-bfcache',
    area: 'rum-and-error-reporting',
    before: 'rum-vitals-no-bfcache.before.mjs',
    after: 'rum-vitals-no-bfcache.after.mjs',
    expected: ['rum-ignores-bfcache-restore@medium', 'rum-cls-reported-early@medium'],
    residual: [],
  },
  {
    slug: 'rum-init-top-level',
    area: 'rum-and-error-reporting',
    before: 'rum-init-top-level.before.mjs',
    after: 'rum-init-top-level.after.mjs',
    expected: ['rum-init-before-consent@high'],
    residual: [],
  },
  {
    slug: 'rum-payload-cookie',
    area: 'rum-and-error-reporting',
    before: 'rum-payload-cookie.before.mjs',
    after: 'rum-payload-cookie.after.mjs',
    expected: ['rum-pii-in-payload@high', 'rum-no-beforesend-scrub@medium'],
    residual: [],
  },
  {
    slug: 'rum-payload-query',
    area: 'rum-and-error-reporting',
    before: 'rum-payload-query.before.mjs',
    after: 'rum-payload-query.after.mjs',
    expected: ['rum-pii-in-payload@medium'],
    residual: [],
  },
  {
    slug: 'rum-onerror-assign',
    area: 'rum-and-error-reporting',
    before: 'rum-onerror-assign.before.mjs',
    after: 'rum-onerror-assign.after.mjs',
    expected: ['rum-onerror-overwrites-handler@medium', 'rum-rejections-uncaptured@medium'],
    residual: [],
  },

  // ---------------------------------------------- synthetic journeys
  {
    slug: 'journey-smoke-no-assert',
    area: 'synthetic-journeys',
    before: 'journey-smoke-no-assert.before.mjs',
    after: 'journey-smoke-no-assert.after.mjs',
    expected: ['journey-asserts-navigation-only@high', 'journey-no-failure-artifact@low'],
    residual: [],
  },
  {
    slug: 'journey-login-sleep',
    area: 'synthetic-journeys',
    before: 'journey-login-sleep.before.mjs',
    after: 'journey-login-sleep.after.mjs',
    expected: ['journey-credentials-inline@high', 'journey-hard-sleep@medium'],
    residual: [],
  },
  {
    slug: 'journey-order-write',
    area: 'synthetic-journeys',
    before: 'journey-order-write.before.mjs',
    after: 'journey-order-write.after.mjs',
    expected: ['journey-writes-production-data@high', 'journey-shared-state-between-steps@medium'],
    residual: [],
  },

  // ---------------------------------------------- the scheduled runner
  {
    slug: 'runner-continue-on-error',
    area: 'scheduled-runner',
    before: 'runner-continue-on-error.before.yml',
    after: 'runner-continue-on-error.after.yml',
    expected: ['runner-continue-on-error@high', 'runner-no-output-artifact@low'],
    residual: [],
  },
  {
    slug: 'runner-hourly-schedule',
    area: 'scheduled-runner',
    before: 'runner-hourly-schedule.before.yml',
    after: 'runner-hourly-schedule.after.yml',
    expected: ['runner-cron-slower-than-interval@high', 'runner-schedule-only@medium'],
    residual: [],
  },
  {
    slug: 'runner-secret-echo',
    area: 'scheduled-runner',
    before: 'runner-secret-echo.before.yml',
    after: 'runner-secret-echo.after.yml',
    expected: [
      'runner-secret-echoed@high',
      'runner-no-job-timeout@medium',
      'runner-no-concurrency-guard@medium',
      'runner-unpinned-action@low',
    ],
    residual: [],
  },

  // ---------------------------------------------- baselines and diffs
  {
    slug: 'diff-count-compare',
    area: 'baselines-and-diffs',
    before: 'diff-count-compare.before.mjs',
    after: 'diff-count-compare.after.mjs',
    expected: ['diff-compares-counts@high', 'diff-ignores-resolved@medium'],
    residual: [],
  },
  {
    slug: 'diff-line-identity',
    area: 'baselines-and-diffs',
    before: 'diff-line-identity.before.mjs',
    after: 'diff-line-identity.after.mjs',
    expected: ['diff-identity-includes-line@high', 'diff-exit-zero-on-regression@high'],
    residual: [],
  },
  {
    slug: 'diff-regenerate-baseline',
    area: 'baselines-and-diffs',
    before: 'diff-regenerate-baseline.before.mjs',
    after: 'diff-regenerate-baseline.after.mjs',
    expected: ['baseline-regenerated-before-compare@high'],
    residual: [],
  },
  {
    slug: 'baseline-no-timestamp',
    area: 'baselines-and-diffs',
    before: 'baseline-no-timestamp.before.json',
    after: 'baseline-no-timestamp.after.json',
    expected: ['baseline-staleness-unchecked@medium'],
    residual: [],
  },
];

export const PAIRS_BY_SLUG = new Map(PAIRS.map((p) => [p.slug, p]));
