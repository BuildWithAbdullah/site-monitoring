// The catalogue of everything this repository can report.
//
// One entry per reason a finding exists, never one per check. A single checker
// may raise several entries and several checkers may raise one entry, but two
// entries never describe the same underlying mistake.
//
// `severities` is the complete set of severities the finding can be emitted at.
// A severity a real run produces that is not listed here fails the build, and a
// severity listed here that no artefact in the corpus ever produces fails the
// build as well. The second direction is the one that does the work.

export const AREAS = [
  {
    id: 'health-and-readiness',
    title: 'Health and readiness endpoints',
    summary:
      'The endpoint a monitor polls. Almost every interesting failure here is an endpoint that answers 200 while the thing it is supposed to vouch for is broken.',
  },
  {
    id: 'check-configuration',
    title: 'Check configuration',
    summary:
      'Intervals, timeouts, retries, expectations and vantage points. The arithmetic between these numbers is where a monitor quietly stops being able to see an outage.',
  },
  {
    id: 'alerting-and-escalation',
    title: 'Alerting and escalation',
    summary:
      'Thresholds, grouping, no data handling, routing and recovery. An alert that cannot fire and an alert that fires constantly fail the same way, because both end up ignored.',
  },
  {
    id: 'rum-and-error-reporting',
    title: 'Real user monitoring and error reporting',
    summary:
      'Client side instrumentation. Monitoring that is loaded wrongly changes the metric it exists to measure, and monitoring that reports too much turns a performance tool into a privacy incident.',
  },
  {
    id: 'synthetic-journeys',
    title: 'Synthetic journeys',
    summary:
      'Scripted sessions against a real site. A journey that asserts nothing passes forever, and a journey that writes to production leaves evidence behind.',
  },
  {
    id: 'scheduled-runner',
    title: 'The scheduled runner',
    summary:
      'The workflow that actually runs the checks. A monitor nobody monitors is the most common silent failure in this whole domain.',
  },
  {
    id: 'baselines-and-diffs',
    title: 'Baselines and regression diffs',
    summary:
      'Comparing one run against the last one. The identity of a finding is the entire problem: get it wrong and the diff reports noise, or reports nothing.',
  },
];

export const FINDINGS = [
  // ---------------------------------------------------------------- area A
  {
    id: 'health-ignores-dependencies',
    area: 'health-and-readiness',
    severities: ['high'],
    title: 'The health handler answers without probing anything',
    reason:
      'The handler returns a healthy response on a path that touches none of the dependencies the service needs. It reports that the process is running, which the monitor already knows from the connection succeeding.',
    remedy:
      'Probe at least one dependency on the request path and let the result decide the status code.',
  },
  {
    id: 'health-swallows-dependency-error',
    area: 'health-and-readiness',
    severities: ['high'],
    title: 'A failed dependency probe is caught and the healthy response is sent anyway',
    reason:
      'The probe is wrapped in a catch whose body still produces the success response. The endpoint then reports healthy precisely when the dependency is down, which is the one moment it was built for.',
    remedy:
      'Let the catch set a failing status code, and keep the detail out of the public body.',
  },
  {
    id: 'health-no-dependency-timeout',
    area: 'health-and-readiness',
    severities: ['medium'],
    title: 'The dependency probe has no timeout',
    reason:
      'An awaited probe with no timeout makes the endpoint as slow as the slowest dependency. The monitor times out instead, so an unreachable database is indistinguishable from an unreachable site.',
    remedy:
      'Race the probe against a timer and report the timeout as its own failing state.',
  },
  {
    id: 'health-liveness-and-readiness-shared',
    area: 'health-and-readiness',
    severities: ['medium'],
    title: 'One handler serves both liveness and readiness',
    reason:
      'Liveness answers whether the process should be restarted and readiness answers whether it should receive traffic. Sharing a handler means a slow dependency restarts a process that was working.',
    remedy: 'Register two handlers. Liveness probes nothing outside the process.',
  },
  {
    id: 'health-result-cached-without-expiry',
    area: 'health-and-readiness',
    severities: ['medium'],
    title: 'The health result is memoised with no expiry',
    reason:
      'A cached result with no time to live means the endpoint reports the state of the dependency at the moment of the first request after boot, for as long as the process lives.',
    remedy: 'Give the cache a time to live shorter than the check interval.',
  },
  {
    id: 'health-degraded-with-ok-status',
    area: 'health-and-readiness',
    severities: ['high'],
    title: 'The body says degraded while the status code says 200',
    reason:
      'Most monitors are configured on the status code alone. A body that reports a problem under a 200 is a problem nobody will be told about.',
    remedy: 'Let the worst dependency state choose the status code.',
  },
  {
    id: 'health-leaks-internal-detail',
    area: 'health-and-readiness',
    severities: ['high', 'medium'],
    title: 'The public health body carries internal detail',
    reason:
      'A health endpoint is usually unauthenticated and frequently indexed. Connection strings and credentials in its body are high severity; stack traces, host names and dependency versions are an inventory of what to attack next.',
    remedy:
      'Return a state per dependency and nothing else. Keep the detail in the log.',
  },
  {
    id: 'health-writes-on-every-call',
    area: 'health-and-readiness',
    severities: ['low'],
    title: 'The probe writes to the store on every call',
    reason:
      'A write as a liveness probe multiplies the check frequency by the number of vantage points and turns a monitor into a load generator. It also fails for a reason unrelated to availability when the store goes read only.',
    remedy: 'Probe with a read, and prove writability on a schedule instead.',
  },
  {
    id: 'health-readiness-ignores-warmup',
    area: 'health-and-readiness',
    severities: ['medium'],
    title: 'Readiness answers before warmup has finished',
    reason:
      'A process that reports ready before its caches, pools and compiled templates exist receives traffic it will serve slowly or fail. The first minute after every deploy is then worse than it needs to be.',
    remedy: 'Gate readiness on a flag the warmup sets.',
  },
  {
    id: 'health-endpoint-requires-auth',
    area: 'health-and-readiness',
    severities: ['medium'],
    title: 'The health handler refuses an unauthenticated request before probing',
    reason:
      'An endpoint that answers 401 to the monitor reports the same thing whether the service is healthy or not, so the check measures the authentication layer and nothing else.',
    remedy:
      'Serve a minimal unauthenticated state, and keep the detailed view behind the token.',
  },

  // ---------------------------------------------------------------- area B
  {
    id: 'check-no-timeout',
    area: 'check-configuration',
    severities: ['high'],
    title: 'A check declares no timeout',
    reason:
      'Without a timeout the runner default decides, and runner defaults are usually long. A hung endpoint then produces no sample at all rather than a failing one, so the dashboard shows a gap instead of an outage.',
    remedy: 'Declare a timeout well under the interval.',
  },
  {
    id: 'check-timeout-not-less-than-interval',
    area: 'check-configuration',
    severities: ['high', 'medium'],
    title: 'The timeout is not shorter than the interval',
    reason:
      'A timeout longer than the interval lets checks overlap, so a slow site is polled by an ever growing number of concurrent requests. A timeout exactly equal to the interval leaves no room for the runner to schedule at all.',
    remedy: 'Keep the timeout at most half the interval.',
  },
  {
    id: 'check-interval-exceeds-alert-window',
    area: 'check-configuration',
    severities: ['high'],
    title: 'The interval is longer than the window the alert measures',
    reason:
      'An alert that evaluates a five minute window over a check that runs every fifteen minutes has at most one sample and often none. The alert cannot fire for the reason it was written.',
    remedy: 'Make the interval divide the window with samples to spare.',
  },
  {
    id: 'check-accepts-any-redirect',
    area: 'check-configuration',
    severities: ['medium'],
    title: 'A redirect counts as a pass',
    reason:
      'A check that accepts 3xx, or follows redirects without asserting where it landed, passes when the domain has been parked, transferred or redirected to a holding page.',
    remedy: 'Expect one status, and assert the final URL when following.',
  },
  {
    id: 'check-asserts-status-only',
    area: 'check-configuration',
    severities: ['medium'],
    title: 'The check asserts a status code and nothing about the body',
    reason:
      'Plenty of broken pages return 200: an empty template, a cached error, a maintenance page, a site serving someone else content. The status code is the weakest signal the response carries.',
    remedy: 'Assert a string that only the working page contains.',
  },
  {
    id: 'check-single-vantage-point',
    area: 'check-configuration',
    severities: ['low'],
    title: 'The check runs from one vantage point',
    reason:
      'A single origin cannot tell a site outage from a network fault between the runner and the site, so every network incident on the path becomes a page about the site.',
    remedy: 'Declare more than one region and require agreement before alerting.',
  },
  {
    id: 'check-retries-exceed-interval',
    area: 'check-configuration',
    severities: ['high'],
    title: 'The retry budget does not fit inside the interval',
    reason:
      'Retries multiplied by timeout and backoff can exceed the interval, so a failing check occupies the runner past its next slot. Samples are then lost at exactly the moment they matter.',
    remedy:
      'Size retries so the worst case attempt sequence finishes inside the interval.',
  },
  {
    id: 'check-retries-without-backoff',
    area: 'check-configuration',
    severities: ['low'],
    title: 'Retries have no backoff',
    reason:
      'Immediate retries against a service that is failing because it is overloaded add load in the same instant, and three samples taken inside a second are one sample.',
    remedy: 'Declare a backoff and keep the total inside the interval.',
  },
  {
    id: 'check-plain-http-target',
    area: 'check-configuration',
    severities: ['medium'],
    title: 'The check targets a plain http URL',
    reason:
      'An http target measures the redirect, not the site, and it cannot observe a certificate or handshake problem at all. The one failure class that takes a site down without any code changing is invisible.',
    remedy: 'Check the https URL directly.',
  },
  {
    id: 'check-tls-expiry-unmonitored',
    area: 'check-configuration',
    severities: ['medium'],
    title: 'Certificate expiry is not monitored',
    reason:
      'An expiring certificate is the one outage with a known date, and an https check that only reads the status code finds out about it at the same moment as the visitors.',
    remedy: 'Declare a warning window on the certificate for every https target.',
  },
  {
    id: 'check-tls-warning-window-too-short',
    area: 'check-configuration',
    severities: ['low'],
    title: 'The certificate warning window is shorter than a renewal takes',
    reason:
      'A window of a few days leaves no time for a validation that needs a DNS change, a purchase, or somebody who is on leave.',
    remedy: 'Warn at least two weeks out, and again close to the date.',
  },
  {
    id: 'check-dns-unmonitored',
    area: 'check-configuration',
    severities: ['low'],
    title: 'Resolution is not checked separately from the request',
    reason:
      'When a name stops resolving the HTTP check fails, which is right, but it reports the site as down rather than the name as missing, and the two are fixed by different people in different systems.',
    remedy: 'Add a resolution check for every host under check.',
  },

  // ---------------------------------------------------------------- area C
  {
    id: 'alert-fires-on-single-sample',
    area: 'alerting-and-escalation',
    severities: ['medium'],
    title: 'One failed sample pages somebody',
    reason:
      'A single sample cannot distinguish an outage from a dropped packet. An alert that fires on one sample trains its audience to ignore it, which costs more than the alert was ever worth.',
    remedy: 'Require consecutive failures, and keep the count small enough to stay inside the window.',
  },
  {
    id: 'alert-no-data-treated-as-healthy',
    area: 'alerting-and-escalation',
    severities: ['high'],
    title: 'No data counts as healthy',
    reason:
      'The absence of samples is what a broken monitor looks like, and also what a site that cannot be reached at all looks like. Treating it as healthy makes the monitoring system fail silently by design.',
    remedy: 'Declare no data as a failing state and alert on it.',
  },
  {
    id: 'alert-group-window-exceeds-incident',
    area: 'alerting-and-escalation',
    severities: ['medium'],
    title: 'The grouping window is longer than an incident',
    reason:
      'Deduplication exists so one outage is one page. A window longer than the incident it groups suppresses the second, unrelated incident that starts while the first is still open.',
    remedy: 'Keep the window shorter than the incident response budget.',
  },
  {
    id: 'alert-no-escalation',
    area: 'alerting-and-escalation',
    severities: ['medium'],
    title: 'There is one receiver and no escalation',
    reason:
      'A single receiver is a single point of failure in the part of the system whose entire job is telling somebody. If that person is asleep, driving or has the application muted, the alert has not happened.',
    remedy: 'Declare a second step with a delay.',
  },
  {
    id: 'alert-no-maintenance-window',
    area: 'alerting-and-escalation',
    severities: ['low'],
    title: 'There is no way to silence alerts during planned work',
    reason:
      'Without a silencing mechanism every deploy and every migration pages somebody, and the response is to mute the channel permanently rather than for the hour.',
    remedy: 'Declare maintenance windows and reference them from the deploy.',
  },
  {
    id: 'alert-threshold-on-mean',
    area: 'alerting-and-escalation',
    severities: ['medium'],
    title: 'A latency objective is measured on the mean',
    reason:
      'A mean hides the tail, and the tail is the experience people complain about. A page can be unusable for one visitor in twenty while the mean stays comfortably inside the objective.',
    remedy: 'Threshold a high percentile.',
  },
  {
    id: 'alert-missing-runbook',
    area: 'alerting-and-escalation',
    severities: ['low'],
    title: 'A high severity alert carries no runbook',
    reason:
      'The person woken by an alert at four in the morning has the alert text and nothing else. Without a first step the first ten minutes go on working out what the alert means.',
    remedy: 'Attach a runbook reference to every alert that pages.',
  },
  {
    id: 'alert-pipeline-unmonitored',
    area: 'alerting-and-escalation',
    severities: ['high'],
    title: 'Nothing watches the monitor itself',
    reason:
      'Every alert in the document depends on samples arriving. If the runner stops, the queue backs up or the credential expires, every alert goes quiet and quiet reads exactly like healthy.',
    remedy: 'Declare a heartbeat alert that fires when the pipeline stops reporting.',
  },
  {
    id: 'alert-severity-inferred-from-name',
    area: 'alerting-and-escalation',
    severities: ['medium'],
    title: 'The alert declares no severity',
    reason:
      'A severity inferred from the alert name by whatever reads it later is a severity nobody chose. The same alert then routes differently in two tools.',
    remedy: 'Declare the severity on the alert.',
  },
  {
    id: 'alert-no-recovery-notification',
    area: 'alerting-and-escalation',
    severities: ['low'],
    title: 'Recovery is not announced',
    reason:
      'An alert with no recovery notification leaves the incident open in every head that saw it, and the next person to look cannot tell whether the problem is current.',
    remedy: 'Notify on recovery through the same route as the alert.',
  },

  // ---------------------------------------------------------------- area D
  {
    id: 'rum-script-blocks-render',
    area: 'rum-and-error-reporting',
    severities: ['high'],
    title: 'The monitoring script blocks rendering',
    reason:
      'A synchronous script in the head delays the first paint of every page. Monitoring loaded this way makes the numbers it reports worse, and the worse number is real.',
    remedy: 'Load it with async or defer, or inject it after first paint.',
  },
  {
    id: 'rum-sample-rate-missing',
    area: 'rum-and-error-reporting',
    severities: ['medium'],
    title: 'No sample rate is declared',
    reason:
      'Without a declared rate the default decides, and the default is usually everything. Nobody notices until the bill or the beacon volume arrives, and then the rate is cut in a hurry to a number nobody has reasoned about.',
    remedy: 'Declare a rate, and record what population it is meant to give.',
  },
  {
    id: 'rum-beacon-on-unload',
    area: 'rum-and-error-reporting',
    severities: ['high'],
    title: 'Metrics are sent on unload',
    reason:
      'Unload and beforeunload do not fire reliably on mobile, and a page restored from the back forward cache never fires them at all. The sessions that are dropped are not a random sample: they are the ones that left.',
    remedy: 'Send on visibilitychange to hidden, with sendBeacon.',
  },
  {
    id: 'rum-beacon-not-sendbeacon',
    area: 'rum-and-error-reporting',
    severities: ['medium'],
    title: 'The final beacon is an ordinary request',
    reason:
      'A fetch issued while the page is being discarded is cancelled with the document unless it is marked to outlive it, so the last and most interesting measurement of the session is the one most often lost.',
    remedy: 'Use sendBeacon, or fetch with keepalive.',
  },
  {
    id: 'rum-ignores-bfcache-restore',
    area: 'rum-and-error-reporting',
    severities: ['medium'],
    title: 'A back forward cache restore is reported as a fresh load',
    reason:
      'A restored page has no navigation timing worth reporting, and reporting one anyway fills the fast end of the distribution with sessions that did not load anything. The field data then disagrees with every lab measurement.',
    remedy: 'Read the persisted flag on pageshow and report a restore as its own kind.',
  },
  {
    id: 'rum-cls-reported-early',
    area: 'rum-and-error-reporting',
    severities: ['medium'],
    title: 'Layout shift is reported before the page is done shifting',
    reason:
      'Cumulative layout shift is only final when the page is hidden. A value read at load time or on a timer systematically under reports, and the shifts caused by late content are exactly the ones worth knowing about.',
    remedy: 'Report the value when the page becomes hidden.',
  },
  {
    id: 'rum-init-before-consent',
    area: 'rum-and-error-reporting',
    severities: ['high'],
    title: 'Instrumentation starts before consent is known',
    reason:
      'A monitoring client that initialises at the top level of the bundle has already set its identifiers and sent its first beacon before anybody has answered the banner.',
    remedy: 'Initialise from the consent callback, and keep the queue in memory until then.',
  },
  {
    id: 'rum-pii-in-payload',
    area: 'rum-and-error-reporting',
    severities: ['high', 'medium'],
    title: 'The payload carries personal data',
    reason:
      'Cookies and anything of the shape of an address or an account identifier are high severity because they are personal data leaving the page under a performance budget. A raw query string is medium because it depends on what the site puts there, and sites put everything there.',
    remedy: 'Send a path with its parameters stripped, and allow list the fields.',
  },
  {
    id: 'rum-no-beforesend-scrub',
    area: 'rum-and-error-reporting',
    severities: ['medium'],
    title: 'The error reporter has no scrubbing hook',
    reason:
      'Error payloads carry breadcrumbs, request bodies and URLs assembled by code nobody audited for this purpose. Without a hook that strips them, the reporter decides what leaves the page.',
    remedy: 'Configure a hook that drops unknown fields rather than one that masks known ones.',
  },
  {
    id: 'rum-onerror-overwrites-handler',
    area: 'rum-and-error-reporting',
    severities: ['medium'],
    title: 'The global error handler is assigned rather than added',
    reason:
      'Assigning to the global handler replaces whatever was there, which in practice is another tool doing the same thing. Load order then decides which of two error reporters works.',
    remedy: 'Add a listener, and keep any previous handler in the chain.',
  },
  {
    id: 'rum-rejections-uncaptured',
    area: 'rum-and-error-reporting',
    severities: ['medium'],
    title: 'Unhandled promise rejections are not captured',
    reason:
      'A rejected promise with no catch does not reach the global error handler. In a codebase that awaits anything, that is most of the failures, and they are invisible to a reporter that only listens for errors.',
    remedy: 'Listen for unhandledrejection as well.',
  },
  {
    id: 'rum-release-not-attached',
    area: 'rum-and-error-reporting',
    severities: ['low'],
    title: 'No release identifier is attached',
    reason:
      'Without a release on every event, a spike cannot be tied to the deploy that caused it, and the question that matters during an incident, whether this started with the last release, cannot be answered.',
    remedy: 'Attach the build identifier at init.',
  },

  // ---------------------------------------------------------------- area E
  {
    id: 'journey-asserts-navigation-only',
    area: 'synthetic-journeys',
    severities: ['high'],
    title: 'The journey navigates and asserts nothing',
    reason:
      'A script that clicks through a flow without asserting on content passes against an empty page, an error page and a login wall. It is a check that cannot fail for the reason it was written.',
    remedy: 'Assert on something only the working step renders.',
  },
  {
    id: 'journey-hard-sleep',
    area: 'synthetic-journeys',
    severities: ['medium'],
    title: 'The journey waits with a fixed sleep',
    reason:
      'A fixed sleep is either longer than it needs to be, which inflates every run, or shorter than the slowest case, which produces a failure that is about the sleep rather than the site.',
    remedy: 'Wait for the condition the next step needs.',
  },
  {
    id: 'journey-credentials-inline',
    area: 'synthetic-journeys',
    severities: ['high'],
    title: 'A credential is written into the journey',
    reason:
      'A password in a monitoring script is a password in the repository, in the run log of every failure, and in the artefact bundle. Monitoring code is copied and shared more freely than application code, which makes it worse.',
    remedy: 'Read it from the environment and keep it out of the log.',
  },
  {
    id: 'journey-writes-production-data',
    area: 'synthetic-journeys',
    severities: ['high'],
    title: 'The journey writes production data with no marker and no cleanup',
    reason:
      'A checkout journey that runs every five minutes creates orders, charges, emails and stock movements. Without a marker they cannot be excluded from reporting, and without cleanup they accumulate forever.',
    remedy: 'Tag the record, and remove it at the end of the run.',
  },
  {
    id: 'journey-no-failure-artifact',
    area: 'synthetic-journeys',
    severities: ['low'],
    title: 'A failing run keeps no evidence',
    reason:
      'A synthetic failure is usually not reproducible by hand ten minutes later. Without a screenshot, a trace or the response body, the only record is that something failed once.',
    remedy: 'Capture on failure and retain the capture with the run.',
  },
  {
    id: 'journey-shared-state-between-steps',
    area: 'synthetic-journeys',
    severities: ['medium'],
    title: 'Steps share mutable state across runs',
    reason:
      'State held at module level outlives the step that set it, so one failure cascades into every later step and a single broken page produces ten alerts about different things.',
    remedy: 'Pass state through the step, and build fresh state per run.',
  },

  // ---------------------------------------------------------------- area F
  {
    id: 'runner-continue-on-error',
    area: 'scheduled-runner',
    severities: ['high'],
    title: 'The monitoring step is allowed to fail',
    reason:
      'A step marked to continue on error makes a failing check a green run. The workflow then reports success for as long as the site is broken, which is worse than having no workflow.',
    remedy: 'Let the step fail the job, and handle expected flake with retries inside the check.',
  },
  {
    id: 'runner-no-job-timeout',
    area: 'scheduled-runner',
    severities: ['medium'],
    title: 'The job has no timeout',
    reason:
      'A hung check holds a runner for the platform maximum, which is hours. Every scheduled run queued behind it is lost, so one hang silences the monitor for the rest of the day.',
    remedy: 'Set a job timeout a little above the worst case run.',
  },
  {
    id: 'runner-cron-slower-than-interval',
    area: 'scheduled-runner',
    severities: ['high'],
    title: 'The schedule cannot deliver the declared interval',
    reason:
      'A check that claims a five minute interval and runs from a schedule that fires hourly has an interval of an hour, and every alert window written against the declared figure is wrong.',
    remedy: 'Make the schedule at least as frequent as the interval, and allow for drift.',
  },
  {
    id: 'runner-no-concurrency-guard',
    area: 'scheduled-runner',
    severities: ['medium'],
    title: 'Runs of the same monitor can overlap',
    reason:
      'Without a concurrency group a slow run and the next scheduled run execute together, which doubles the load on the site under check and produces two samples with one timestamp.',
    remedy: 'Declare a concurrency group that cancels or queues.',
  },
  {
    id: 'runner-no-output-artifact',
    area: 'scheduled-runner',
    severities: ['low'],
    title: 'The run keeps no output',
    reason:
      'Log retention is shorter than the time it takes for somebody to ask what happened last Tuesday. Without an artefact the record of every past check is gone.',
    remedy: 'Upload the run output and keep it long enough to be useful.',
  },
  {
    id: 'runner-secret-echoed',
    area: 'scheduled-runner',
    severities: ['high'],
    title: 'A step prints a secret',
    reason:
      'A secret interpolated into a shell command appears in the log, and masking is best effort against exact matches only. Base64, a fragment, or a secret inside a JSON blob is printed in full.',
    remedy: 'Pass it through the environment and never into the command line.',
  },
  {
    id: 'runner-schedule-only',
    area: 'scheduled-runner',
    severities: ['medium'],
    title: 'The workflow can only be started by its schedule',
    reason:
      'A schedule only workflow cannot be tested without waiting, and a schedule that has been disabled by the platform for inactivity looks exactly like a schedule that is working.',
    remedy: 'Add a manual trigger and use it as part of the incident runbook.',
  },
  {
    id: 'runner-unpinned-action',
    area: 'scheduled-runner',
    severities: ['low'],
    title: 'A third party action is used by a mutable reference',
    reason:
      'A tag can be moved. An action referenced by tag in the workflow that holds the monitoring credentials is a supply chain path into those credentials that changes without a commit.',
    remedy: 'Pin to a commit identifier and update it deliberately.',
  },

  // ---------------------------------------------------------------- area G
  {
    id: 'diff-compares-counts',
    area: 'baselines-and-diffs',
    severities: ['high'],
    title: 'The diff compares counts rather than identities',
    reason:
      'One finding fixed and one finding introduced leaves the count unchanged, so the regression is invisible. Every comparison of two lengths has this hole in it.',
    remedy: 'Compare sets of identities and report both directions.',
  },
  {
    id: 'diff-ignores-resolved',
    area: 'baselines-and-diffs',
    severities: ['medium'],
    title: 'Findings that disappeared are not reported',
    reason:
      'A finding that vanishes is either a fix worth recording or a checker that stopped working, and those need telling apart. A diff that only looks for new findings cannot see a detector that has been silently disabled.',
    remedy: 'Report resolved findings as their own list and require them to be acknowledged.',
  },
  {
    id: 'diff-identity-includes-line',
    area: 'baselines-and-diffs',
    severities: ['high'],
    title: 'The finding identity includes a line number',
    reason:
      'A key built from a line number changes when anything above it moves, so a formatting change reports every finding in the file as resolved and introduces the same findings as new. The diff becomes noise on the first reflow.',
    remedy: 'Key on the finding, the file and a stable excerpt, never a position.',
  },
  {
    id: 'diff-exit-zero-on-regression',
    area: 'baselines-and-diffs',
    severities: ['high'],
    title: 'A regression does not fail the run',
    reason:
      'A diff that prints regressions and exits zero is a diff whose output nobody reads, because the only consumer of a scheduled job is its exit code.',
    remedy: 'Exit non zero when the regression list is not empty.',
  },
  {
    id: 'baseline-regenerated-before-compare',
    area: 'baselines-and-diffs',
    severities: ['high'],
    title: 'The baseline is written from the run it is compared against',
    reason:
      'Regenerating the baseline and then comparing to it compares a run with itself, so the comparison passes forever. This is the same mistake as a checker that regenerates the file it is checking.',
    remedy: 'Read the committed baseline, compare, and write the new one only when the diff is accepted.',
  },
  {
    id: 'baseline-staleness-unchecked',
    area: 'baselines-and-diffs',
    severities: ['medium'],
    title: 'Nothing notices a baseline that has stopped being updated',
    reason:
      'A baseline with no recorded generation time drifts from the site it describes, and after a few months the diff is reporting the difference between today and a site that no longer exists.',
    remedy: 'Record when the baseline was generated and fail when it is older than the policy allows.',
  },
];

export const FINDINGS_BY_ID = new Map(FINDINGS.map((f) => [f.id, f]));
