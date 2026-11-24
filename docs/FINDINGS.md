# Findings

Generated from `src/catalogue.mjs` by `node tools/gen-docs.mjs`. Editing this
file by hand will fail CI.

64 findings across 7 areas. One entry per reason, never one per
check. The severities column is the complete set the finding can be emitted
at, and both directions of that are asserted: a severity a run produces that
is not listed fails the build, and a severity listed that no artefact ever
produces fails the build as well.

## Health and readiness endpoints

The endpoint a monitor polls. Almost every interesting failure here is an endpoint that answers 200 while the thing it is supposed to vouch for is broken.

10 findings.

### `health-ignores-dependencies`

**The health handler answers without probing anything**

Severities: `high`

The handler returns a healthy response on a path that touches none of the dependencies the service needs. It reports that the process is running, which the monitor already knows from the connection succeeding.

*Remedy.* Probe at least one dependency on the request path and let the result decide the status code.

*Examples.* `health-static-ok`

### `health-swallows-dependency-error`

**A failed dependency probe is caught and the healthy response is sent anyway**

Severities: `high`

The probe is wrapped in a catch whose body still produces the success response. The endpoint then reports healthy precisely when the dependency is down, which is the one moment it was built for.

*Remedy.* Let the catch set a failing status code, and keep the detail out of the public body.

*Examples.* `health-swallowed-error`

### `health-no-dependency-timeout`

**The dependency probe has no timeout**

Severities: `medium`

An awaited probe with no timeout makes the endpoint as slow as the slowest dependency. The monitor times out instead, so an unreachable database is indistinguishable from an unreachable site.

*Remedy.* Race the probe against a timer and report the timeout as its own failing state.

*Examples.* `health-no-timeout`

### `health-liveness-and-readiness-shared`

**One handler serves both liveness and readiness**

Severities: `medium`

Liveness answers whether the process should be restarted and readiness answers whether it should receive traffic. Sharing a handler means a slow dependency restarts a process that was working.

*Remedy.* Register two handlers. Liveness probes nothing outside the process.

*Examples.* `health-shared-probes`

### `health-result-cached-without-expiry`

**The health result is memoised with no expiry**

Severities: `medium`

A cached result with no time to live means the endpoint reports the state of the dependency at the moment of the first request after boot, for as long as the process lives.

*Remedy.* Give the cache a time to live shorter than the check interval.

*Examples.* `health-cached-forever`

### `health-degraded-with-ok-status`

**The body says degraded while the status code says 200**

Severities: `high`

Most monitors are configured on the status code alone. A body that reports a problem under a 200 is a problem nobody will be told about.

*Remedy.* Let the worst dependency state choose the status code.

*Examples.* `health-degraded-200`

### `health-leaks-internal-detail`

**The public health body carries internal detail**

Severities: `high`, `medium`

A health endpoint is usually unauthenticated and frequently indexed. Connection strings and credentials in its body are high severity; stack traces, host names and dependency versions are an inventory of what to attack next.

*Remedy.* Return a state per dependency and nothing else. Keep the detail in the log.

*Examples.* `health-swallowed-error`, `health-leaks-dsn`

### `health-writes-on-every-call`

**The probe writes to the store on every call**

Severities: `low`

A write as a liveness probe multiplies the check frequency by the number of vantage points and turns a monitor into a load generator. It also fails for a reason unrelated to availability when the store goes read only.

*Remedy.* Probe with a read, and prove writability on a schedule instead.

*Examples.* `health-no-timeout`

### `health-readiness-ignores-warmup`

**Readiness answers before warmup has finished**

Severities: `medium`

A process that reports ready before its caches, pools and compiled templates exist receives traffic it will serve slowly or fail. The first minute after every deploy is then worse than it needs to be.

*Remedy.* Gate readiness on a flag the warmup sets.

*Examples.* `health-readiness-no-warmup`

### `health-endpoint-requires-auth`

**The health handler refuses an unauthenticated request before probing**

Severities: `medium`

An endpoint that answers 401 to the monitor reports the same thing whether the service is healthy or not, so the check measures the authentication layer and nothing else.

*Remedy.* Serve a minimal unauthenticated state, and keep the detailed view behind the token.

*Examples.* `health-cached-forever`

## Check configuration

Intervals, timeouts, retries, expectations and vantage points. The arithmetic between these numbers is where a monitor quietly stops being able to see an outage.

12 findings.

### `check-no-timeout`

**A check declares no timeout**

Severities: `high`

Without a timeout the runner default decides, and runner defaults are usually long. A hung endpoint then produces no sample at all rather than a failing one, so the dashboard shows a gap instead of an outage.

*Remedy.* Declare a timeout well under the interval.

*Examples.* `checks-minimal`, `checks-internal-single-region`

### `check-timeout-not-less-than-interval`

**The timeout is not shorter than the interval**

Severities: `high`, `medium`

A timeout longer than the interval lets checks overlap, so a slow site is polled by an ever growing number of concurrent requests. A timeout exactly equal to the interval leaves no room for the runner to schedule at all.

*Remedy.* Keep the timeout at most half the interval.

*Examples.* `checks-timeout-over-interval`, `checks-timeout-equals-interval`

### `check-interval-exceeds-alert-window`

**The interval is longer than the window the alert measures**

Severities: `high`

An alert that evaluates a five minute window over a check that runs every fifteen minutes has at most one sample and often none. The alert cannot fire for the reason it was written.

*Remedy.* Make the interval divide the window with samples to spare.

*Examples.* `checks-interval-over-window`

### `check-accepts-any-redirect`

**A redirect counts as a pass**

Severities: `medium`

A check that accepts 3xx, or follows redirects without asserting where it landed, passes when the domain has been parked, transferred or redirected to a holding page.

*Remedy.* Expect one status, and assert the final URL when following.

*Examples.* `checks-redirect-and-http`

### `check-asserts-status-only`

**The check asserts a status code and nothing about the body**

Severities: `medium`

Plenty of broken pages return 200: an empty template, a cached error, a maintenance page, a site serving someone else content. The status code is the weakest signal the response carries.

*Remedy.* Assert a string that only the working page contains.

*Examples.* `checks-minimal`, `checks-internal-single-region`

### `check-single-vantage-point`

**The check runs from one vantage point**

Severities: `low`

A single origin cannot tell a site outage from a network fault between the runner and the site, so every network incident on the path becomes a page about the site.

*Remedy.* Declare more than one region and require agreement before alerting.

*Examples.* `checks-minimal`, `checks-internal-single-region`

### `check-retries-exceed-interval`

**The retry budget does not fit inside the interval**

Severities: `high`

Retries multiplied by timeout and backoff can exceed the interval, so a failing check occupies the runner past its next slot. Samples are then lost at exactly the moment they matter.

*Remedy.* Size retries so the worst case attempt sequence finishes inside the interval.

*Examples.* `checks-timeout-over-interval`

### `check-retries-without-backoff`

**Retries have no backoff**

Severities: `low`

Immediate retries against a service that is failing because it is overloaded add load in the same instant, and three samples taken inside a second are one sample.

*Remedy.* Declare a backoff and keep the total inside the interval.

*Examples.* `checks-retries-no-backoff`

### `check-plain-http-target`

**The check targets a plain http URL**

Severities: `medium`

An http target measures the redirect, not the site, and it cannot observe a certificate or handshake problem at all. The one failure class that takes a site down without any code changing is invisible.

*Remedy.* Check the https URL directly.

*Examples.* `checks-redirect-and-http`

### `check-tls-expiry-unmonitored`

**Certificate expiry is not monitored**

Severities: `medium`

An expiring certificate is the one outage with a known date, and an https check that only reads the status code finds out about it at the same moment as the visitors.

*Remedy.* Declare a warning window on the certificate for every https target.

*Examples.* `checks-minimal`, `checks-internal-single-region`

### `check-tls-warning-window-too-short`

**The certificate warning window is shorter than a renewal takes**

Severities: `low`

A window of a few days leaves no time for a validation that needs a DNS change, a purchase, or somebody who is on leave.

*Remedy.* Warn at least two weeks out, and again close to the date.

*Examples.* `checks-retries-no-backoff`

### `check-dns-unmonitored`

**Resolution is not checked separately from the request**

Severities: `low`

When a name stops resolving the HTTP check fails, which is right, but it reports the site as down rather than the name as missing, and the two are fixed by different people in different systems.

*Remedy.* Add a resolution check for every host under check.

*Examples.* `checks-minimal`, `checks-internal-single-region`

## Alerting and escalation

Thresholds, grouping, no data handling, routing and recovery. An alert that cannot fire and an alert that fires constantly fail the same way, because both end up ignored.

10 findings.

### `alert-fires-on-single-sample`

**One failed sample pages somebody**

Severities: `medium`

A single sample cannot distinguish an outage from a dropped packet. An alert that fires on one sample trains its audience to ignore it, which costs more than the alert was ever worth.

*Remedy.* Require consecutive failures, and keep the count small enough to stay inside the window.

*Examples.* `alerts-flapping`

### `alert-no-data-treated-as-healthy`

**No data counts as healthy**

Severities: `high`

The absence of samples is what a broken monitor looks like, and also what a site that cannot be reached at all looks like. Treating it as healthy makes the monitoring system fail silently by design.

*Remedy.* Declare no data as a failing state and alert on it.

*Examples.* `alerts-no-data-ok`

### `alert-group-window-exceeds-incident`

**The grouping window is longer than an incident**

Severities: `medium`

Deduplication exists so one outage is one page. A window longer than the incident it groups suppresses the second, unrelated incident that starts while the first is still open.

*Remedy.* Keep the window shorter than the incident response budget.

*Examples.* `alerts-dedupe-window`

### `alert-no-escalation`

**There is one receiver and no escalation**

Severities: `medium`

A single receiver is a single point of failure in the part of the system whose entire job is telling somebody. If that person is asleep, driving or has the application muted, the alert has not happened.

*Remedy.* Declare a second step with a delay.

*Examples.* `alerts-dedupe-window`

### `alert-no-maintenance-window`

**There is no way to silence alerts during planned work**

Severities: `low`

Without a silencing mechanism every deploy and every migration pages somebody, and the response is to mute the channel permanently rather than for the hour.

*Remedy.* Declare maintenance windows and reference them from the deploy.

*Examples.* `alerts-no-heartbeat`

### `alert-threshold-on-mean`

**A latency objective is measured on the mean**

Severities: `medium`

A mean hides the tail, and the tail is the experience people complain about. A page can be unusable for one visitor in twenty while the mean stays comfortably inside the objective.

*Remedy.* Threshold a high percentile.

*Examples.* `alerts-mean-latency`

### `alert-missing-runbook`

**A high severity alert carries no runbook**

Severities: `low`

The person woken by an alert at four in the morning has the alert text and nothing else. Without a first step the first ten minutes go on working out what the alert means.

*Remedy.* Attach a runbook reference to every alert that pages.

*Examples.* `alerts-flapping`

### `alert-pipeline-unmonitored`

**Nothing watches the monitor itself**

Severities: `high`

Every alert in the document depends on samples arriving. If the runner stops, the queue backs up or the credential expires, every alert goes quiet and quiet reads exactly like healthy.

*Remedy.* Declare a heartbeat alert that fires when the pipeline stops reporting.

*Examples.* `alerts-no-heartbeat`

### `alert-severity-inferred-from-name`

**The alert declares no severity**

Severities: `medium`

A severity inferred from the alert name by whatever reads it later is a severity nobody chose. The same alert then routes differently in two tools.

*Remedy.* Declare the severity on the alert.

*Examples.* `alerts-no-data-ok`

### `alert-no-recovery-notification`

**Recovery is not announced**

Severities: `low`

An alert with no recovery notification leaves the incident open in every head that saw it, and the next person to look cannot tell whether the problem is current.

*Remedy.* Notify on recovery through the same route as the alert.

*Examples.* `alerts-mean-latency`

## Real user monitoring and error reporting

Client side instrumentation. Monitoring that is loaded wrongly changes the metric it exists to measure, and monitoring that reports too much turns a performance tool into a privacy incident.

12 findings.

### `rum-script-blocks-render`

**The monitoring script blocks rendering**

Severities: `high`

A synchronous script in the head delays the first paint of every page. Monitoring loaded this way makes the numbers it reports worse, and the worse number is real.

*Remedy.* Load it with async or defer, or inject it after first paint.

*Examples.* `rum-loader-sync`

### `rum-sample-rate-missing`

**No sample rate is declared**

Severities: `medium`

Without a declared rate the default decides, and the default is usually everything. Nobody notices until the bill or the beacon volume arrives, and then the rate is cut in a hurry to a number nobody has reasoned about.

*Remedy.* Declare a rate, and record what population it is meant to give.

*Examples.* `rum-init-no-sampling`

### `rum-beacon-on-unload`

**Metrics are sent on unload**

Severities: `high`

Unload and beforeunload do not fire reliably on mobile, and a page restored from the back forward cache never fires them at all. The sessions that are dropped are not a random sample: they are the ones that left.

*Remedy.* Send on visibilitychange to hidden, with sendBeacon.

*Examples.* `rum-beacon-unload`

### `rum-beacon-not-sendbeacon`

**The final beacon is an ordinary request**

Severities: `medium`

A fetch issued while the page is being discarded is cancelled with the document unless it is marked to outlive it, so the last and most interesting measurement of the session is the one most often lost.

*Remedy.* Use sendBeacon, or fetch with keepalive.

*Examples.* `rum-beacon-fetch`

### `rum-ignores-bfcache-restore`

**A back forward cache restore is reported as a fresh load**

Severities: `medium`

A restored page has no navigation timing worth reporting, and reporting one anyway fills the fast end of the distribution with sessions that did not load anything. The field data then disagrees with every lab measurement.

*Remedy.* Read the persisted flag on pageshow and report a restore as its own kind.

*Examples.* `rum-vitals-no-bfcache`

### `rum-cls-reported-early`

**Layout shift is reported before the page is done shifting**

Severities: `medium`

Cumulative layout shift is only final when the page is hidden. A value read at load time or on a timer systematically under reports, and the shifts caused by late content are exactly the ones worth knowing about.

*Remedy.* Report the value when the page becomes hidden.

*Examples.* `rum-vitals-no-bfcache`

### `rum-init-before-consent`

**Instrumentation starts before consent is known**

Severities: `high`

A monitoring client that initialises at the top level of the bundle has already set its identifiers and sent its first beacon before anybody has answered the banner.

*Remedy.* Initialise from the consent callback, and keep the queue in memory until then.

*Examples.* `rum-init-top-level`

### `rum-pii-in-payload`

**The payload carries personal data**

Severities: `high`, `medium`

Cookies and anything of the shape of an address or an account identifier are high severity because they are personal data leaving the page under a performance budget. A raw query string is medium because it depends on what the site puts there, and sites put everything there.

*Remedy.* Send a path with its parameters stripped, and allow list the fields.

*Examples.* `rum-payload-cookie`, `rum-payload-query`

### `rum-no-beforesend-scrub`

**The error reporter has no scrubbing hook**

Severities: `medium`

Error payloads carry breadcrumbs, request bodies and URLs assembled by code nobody audited for this purpose. Without a hook that strips them, the reporter decides what leaves the page.

*Remedy.* Configure a hook that drops unknown fields rather than one that masks known ones.

*Examples.* `rum-payload-cookie`

### `rum-onerror-overwrites-handler`

**The global error handler is assigned rather than added**

Severities: `medium`

Assigning to the global handler replaces whatever was there, which in practice is another tool doing the same thing. Load order then decides which of two error reporters works.

*Remedy.* Add a listener, and keep any previous handler in the chain.

*Examples.* `rum-onerror-assign`

### `rum-rejections-uncaptured`

**Unhandled promise rejections are not captured**

Severities: `medium`

A rejected promise with no catch does not reach the global error handler. In a codebase that awaits anything, that is most of the failures, and they are invisible to a reporter that only listens for errors.

*Remedy.* Listen for unhandledrejection as well.

*Examples.* `rum-onerror-assign`

### `rum-release-not-attached`

**No release identifier is attached**

Severities: `low`

Without a release on every event, a spike cannot be tied to the deploy that caused it, and the question that matters during an incident, whether this started with the last release, cannot be answered.

*Remedy.* Attach the build identifier at init.

*Examples.* `rum-init-no-sampling`

## Synthetic journeys

Scripted sessions against a real site. A journey that asserts nothing passes forever, and a journey that writes to production leaves evidence behind.

6 findings.

### `journey-asserts-navigation-only`

**The journey navigates and asserts nothing**

Severities: `high`

A script that clicks through a flow without asserting on content passes against an empty page, an error page and a login wall. It is a check that cannot fail for the reason it was written.

*Remedy.* Assert on something only the working step renders.

*Examples.* `journey-smoke-no-assert`

### `journey-hard-sleep`

**The journey waits with a fixed sleep**

Severities: `medium`

A fixed sleep is either longer than it needs to be, which inflates every run, or shorter than the slowest case, which produces a failure that is about the sleep rather than the site.

*Remedy.* Wait for the condition the next step needs.

*Examples.* `journey-login-sleep`

### `journey-credentials-inline`

**A credential is written into the journey**

Severities: `high`

A password in a monitoring script is a password in the repository, in the run log of every failure, and in the artefact bundle. Monitoring code is copied and shared more freely than application code, which makes it worse.

*Remedy.* Read it from the environment and keep it out of the log.

*Examples.* `journey-login-sleep`

### `journey-writes-production-data`

**The journey writes production data with no marker and no cleanup**

Severities: `high`

A checkout journey that runs every five minutes creates orders, charges, emails and stock movements. Without a marker they cannot be excluded from reporting, and without cleanup they accumulate forever.

*Remedy.* Tag the record, and remove it at the end of the run.

*Examples.* `journey-order-write`

### `journey-no-failure-artifact`

**A failing run keeps no evidence**

Severities: `low`

A synthetic failure is usually not reproducible by hand ten minutes later. Without a screenshot, a trace or the response body, the only record is that something failed once.

*Remedy.* Capture on failure and retain the capture with the run.

*Examples.* `journey-smoke-no-assert`

### `journey-shared-state-between-steps`

**Steps share mutable state across runs**

Severities: `medium`

State held at module level outlives the step that set it, so one failure cascades into every later step and a single broken page produces ten alerts about different things.

*Remedy.* Pass state through the step, and build fresh state per run.

*Examples.* `journey-order-write`

## The scheduled runner

The workflow that actually runs the checks. A monitor nobody monitors is the most common silent failure in this whole domain.

8 findings.

### `runner-continue-on-error`

**The monitoring step is allowed to fail**

Severities: `high`

A step marked to continue on error makes a failing check a green run. The workflow then reports success for as long as the site is broken, which is worse than having no workflow.

*Remedy.* Let the step fail the job, and handle expected flake with retries inside the check.

*Examples.* `runner-continue-on-error`

### `runner-no-job-timeout`

**The job has no timeout**

Severities: `medium`

A hung check holds a runner for the platform maximum, which is hours. Every scheduled run queued behind it is lost, so one hang silences the monitor for the rest of the day.

*Remedy.* Set a job timeout a little above the worst case run.

*Examples.* `runner-secret-echo`

### `runner-cron-slower-than-interval`

**The schedule cannot deliver the declared interval**

Severities: `high`

A check that claims a five minute interval and runs from a schedule that fires hourly has an interval of an hour, and every alert window written against the declared figure is wrong.

*Remedy.* Make the schedule at least as frequent as the interval, and allow for drift.

*Examples.* `runner-hourly-schedule`

### `runner-no-concurrency-guard`

**Runs of the same monitor can overlap**

Severities: `medium`

Without a concurrency group a slow run and the next scheduled run execute together, which doubles the load on the site under check and produces two samples with one timestamp.

*Remedy.* Declare a concurrency group that cancels or queues.

*Examples.* `runner-secret-echo`

### `runner-no-output-artifact`

**The run keeps no output**

Severities: `low`

Log retention is shorter than the time it takes for somebody to ask what happened last Tuesday. Without an artefact the record of every past check is gone.

*Remedy.* Upload the run output and keep it long enough to be useful.

*Examples.* `runner-continue-on-error`

### `runner-secret-echoed`

**A step prints a secret**

Severities: `high`

A secret interpolated into a shell command appears in the log, and masking is best effort against exact matches only. Base64, a fragment, or a secret inside a JSON blob is printed in full.

*Remedy.* Pass it through the environment and never into the command line.

*Examples.* `runner-secret-echo`

### `runner-schedule-only`

**The workflow can only be started by its schedule**

Severities: `medium`

A schedule only workflow cannot be tested without waiting, and a schedule that has been disabled by the platform for inactivity looks exactly like a schedule that is working.

*Remedy.* Add a manual trigger and use it as part of the incident runbook.

*Examples.* `runner-hourly-schedule`

### `runner-unpinned-action`

**A third party action is used by a mutable reference**

Severities: `low`

A tag can be moved. An action referenced by tag in the workflow that holds the monitoring credentials is a supply chain path into those credentials that changes without a commit.

*Remedy.* Pin to a commit identifier and update it deliberately.

*Examples.* `runner-secret-echo`

## Baselines and regression diffs

Comparing one run against the last one. The identity of a finding is the entire problem: get it wrong and the diff reports noise, or reports nothing.

6 findings.

### `diff-compares-counts`

**The diff compares counts rather than identities**

Severities: `high`

One finding fixed and one finding introduced leaves the count unchanged, so the regression is invisible. Every comparison of two lengths has this hole in it.

*Remedy.* Compare sets of identities and report both directions.

*Examples.* `diff-count-compare`

### `diff-ignores-resolved`

**Findings that disappeared are not reported**

Severities: `medium`

A finding that vanishes is either a fix worth recording or a checker that stopped working, and those need telling apart. A diff that only looks for new findings cannot see a detector that has been silently disabled.

*Remedy.* Report resolved findings as their own list and require them to be acknowledged.

*Examples.* `diff-count-compare`

### `diff-identity-includes-line`

**The finding identity includes a line number**

Severities: `high`

A key built from a line number changes when anything above it moves, so a formatting change reports every finding in the file as resolved and introduces the same findings as new. The diff becomes noise on the first reflow.

*Remedy.* Key on the finding, the file and a stable excerpt, never a position.

*Examples.* `diff-line-identity`

### `diff-exit-zero-on-regression`

**A regression does not fail the run**

Severities: `high`

A diff that prints regressions and exits zero is a diff whose output nobody reads, because the only consumer of a scheduled job is its exit code.

*Remedy.* Exit non zero when the regression list is not empty.

*Examples.* `diff-line-identity`

### `baseline-regenerated-before-compare`

**The baseline is written from the run it is compared against**

Severities: `high`

Regenerating the baseline and then comparing to it compares a run with itself, so the comparison passes forever. This is the same mistake as a checker that regenerates the file it is checking.

*Remedy.* Read the committed baseline, compare, and write the new one only when the diff is accepted.

*Examples.* `diff-regenerate-baseline`

### `baseline-staleness-unchecked`

**Nothing notices a baseline that has stopped being updated**

Severities: `medium`

A baseline with no recorded generation time drifts from the site it describes, and after a few months the diff is reporting the difference between today and a site that no longer exists.

*Remedy.* Record when the baseline was generated and fail when it is older than the policy allows.

*Examples.* `baseline-no-timestamp`

