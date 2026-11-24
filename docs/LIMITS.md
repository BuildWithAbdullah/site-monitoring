# Limits

Generated from `tools/limits.mjs` by `node tools/gen-docs.mjs`. Editing this
file by hand will fail CI.

18 limits: 13 that hide a problem and 5 that manufacture a finding.
Each one carries two artefacts in `limits/`, and the suite asserts both
halves of what its kind means.

A limit that **hides** means the blind case reports nothing when there is
something to report. The suite requires the blind artefact to be clean and
the contrast artefact to report, because a contrast case that reports
nothing proves nothing: a file with no problem in it also reports nothing.

A limit that **manufactures** means the blind case reports something that is
not a problem. The suite requires the blind artefact to report exactly the
stated findings and the contrast artefact to be clean.

## Limits that hide a problem

### `unknown-config-shape`

**A configuration document whose top level keys match no known shape is not audited**

Documents are recognised by their top level keys, because the same file is called twelve different things by twelve different tools. A document that wraps its checks under a vendor key is skipped entirely, and the skip is reported, but nothing inside it is read.

Area: `check-configuration`

Blind case: `limits/unknown-config-shape.blind.json`
, which reports nothing

Contrast case: `limits/unknown-config-shape.contrast.json`
, reporting `check-no-timeout@high`, `check-asserts-status-only@medium`, `check-tls-expiry-unmonitored@medium`, `check-single-vantage-point@low`, `check-dns-unmonitored@low`

### `checks-built-in-code`

**A check list assembled in code is invisible to the configuration checks**

Area B reads declared values. A check list built by a loop at run time has no declared values to read, so none of the interval, timeout or expectation rules apply to it. This is the single largest blind spot in the repository and the reason the documented input kind is a declarative document.

Area: `check-configuration`

Blind case: `limits/checks-built-in-code.blind.mjs`
, which reports nothing

Contrast case: `limits/checks-built-in-code.contrast.json`
, reporting `check-no-timeout@high`, `check-asserts-status-only@medium`, `check-tls-expiry-unmonitored@medium`, `check-single-vantage-point@low`, `check-dns-unmonitored@low`

### `yaml-flow-sequence`

**Steps written as a flow sequence are not read**

The workflow reader handles block mappings, block sequences and plain or quoted scalars. A flow collection is recorded as unread and its contents are not judged, so a job whose steps are written inline is not audited at all.

Area: `scheduled-runner`

Blind case: `limits/yaml-flow-sequence.blind.yml`
, which reports nothing

Contrast case: `limits/yaml-flow-sequence.contrast.yml`
, reporting `runner-continue-on-error@high`

### `dynamic-code`

**Code assembled in a string and compiled at run time is not read**

Every scanner runs on a masked copy in which the contents of strings are blanked, which is what stops a scanner reading code quoted inside a test fixture. The same masking means a handler body built as a string and passed to a compiler is invisible.

Area: `health-and-readiness`

Blind case: `limits/dynamic-code.blind.mjs`
, which reports nothing

Contrast case: `limits/dynamic-code.contrast.mjs`
, reporting `health-ignores-dependencies@high`

### `single-file-scope`

**One file is audited at a time, so a call into another module is not followed**

A handler name or an init call that lives in another module is not resolved. A handler passed by name within the same file is resolved, which is what lets one handler registered at two paths be recognised, but nothing crosses a module boundary.

Area: `rum-and-error-reporting`

Blind case: `limits/single-file-scope.blind.mjs`
, which reports nothing

Contrast case: `limits/single-file-scope.contrast.mjs`
, reporting `rum-init-before-consent@high`

### `durations-need-units`

**A duration whose key carries no unit is not read**

Every comparison in area B is arithmetic, and guessing between seconds and milliseconds is wrong by three orders of magnitude. A bare interval or timeout key is left alone, which means neither the missing timeout finding nor any of the interval arithmetic applies to it. A declared blind spot is better than a confident wrong answer.

Area: `check-configuration`

Blind case: `limits/durations-need-units.blind.json`
, which reports nothing

Contrast case: `limits/durations-need-units.contrast.json`
, reporting `check-timeout-not-less-than-interval@high`

### `cron-descriptors`

**A schedule written as a descriptor has no period this reader can work out**

The cron reader handles the five field form with wildcards, steps and fixed values. A descriptor, a sixth field or a day of week constraint produces no period, so the comparison between the schedule and the interval it is meant to deliver is skipped.

Area: `scheduled-runner`

Blind case: `limits/cron-descriptors.blind.yml`
, which reports nothing

Contrast case: `limits/cron-descriptors.contrast.yml`
, reporting `runner-cron-slower-than-interval@high`

### `interval-not-declared`

**A workflow that does not say what interval it serves cannot be checked against it**

The comparison needs both numbers. The schedule is in the workflow, and the interval is usually in the configuration the workflow runs, which is a different file. A workflow that declares the interval it serves in its environment can be checked; one that does not is left alone.

Area: `scheduled-runner`

Blind case: `limits/interval-not-declared.blind.yml`
, which reports nothing

Contrast case: `limits/interval-not-declared.contrast.yml`
, reporting `runner-cron-slower-than-interval@high`

### `alert-linkage-by-id`

**An alert that selects its check by a tag is not linked to that check**

The interval against window comparison needs to know which check an alert is about, and the only linkage it reads is an explicit check identifier. An alert that selects by tag, label or expression is not linked, so the comparison does not happen.

Area: `alerting-and-escalation`

Blind case: `limits/alert-linkage-by-id.blind.json`
, which reports nothing

Contrast case: `limits/alert-linkage-by-id.contrast.json`
, reporting `check-interval-exceeds-alert-window@high`

### `pii-shapes-enumerated`

**Personal data is recognised by documented shapes only**

The payload check knows about cookies, raw URLs and a documented list of field names. A custom identifier that identifies a person is not recognised, and the check has no way to learn what a given system considers identifying.

Area: `rum-and-error-reporting`

Blind case: `limits/pii-shapes-enumerated.blind.mjs`
, which reports nothing

Contrast case: `limits/pii-shapes-enumerated.contrast.mjs`
, reporting `rum-pii-in-payload@high`

### `check-url-not-readable`

**A check whose URL is not a readable URL has no scheme or host to judge**

A URL written as a template placeholder, filled in by the runner from an environment variable, has no scheme and no host in the document. The plain http finding, the certificate warning window and the resolution check all depend on reading those, so none of them applies to that check.

Area: `check-configuration`

Blind case: `limits/check-url-not-readable.blind.json`
, which reports nothing

Contrast case: `limits/check-url-not-readable.contrast.json`
, reporting `check-plain-http-target@medium`

### `init-in-conditional`

**An init inside any conditional is treated as gated, whatever the condition is**

Reporting an init that sits inside a condition would mean deciding what the condition means, and an init guarded by a feature flag is not an init that runs before consent. The consequence is that an init guarded by something genuinely unrelated to consent is not reported. The alternative was a finding against correct code, which costs more.

Area: `rum-and-error-reporting`

Blind case: `limits/init-in-conditional.blind.mjs`
, which reports nothing

Contrast case: `limits/init-in-conditional.contrast.mjs`
, reporting `rum-init-before-consent@high`

### `continue-on-error-expression`

**A permission to fail written as an expression is compared rather than evaluated**

The reader compares values. A step whose continue-on-error is an expression the platform evaluates at run time is not judged, which means the most interesting version of this problem, a step allowed to fail only on the scheduled runs, is invisible. Evaluating the expression would mean implementing the platform.

Area: `scheduled-runner`

Blind case: `limits/continue-on-error-expression.blind.yml`
, which reports nothing

Contrast case: `limits/continue-on-error-expression.contrast.yml`
, reporting `runner-continue-on-error@high`

## Limits that manufacture a finding

### `journey-assertions-by-name`

**An assertion helper named outside the convention is not recognised as an assertion**

A call named expectSomething, assertSomething or verifySomething counts as an assertion, as does waiting for a selector. A helper named anything else, in another module, is not recognised, and the journey is reported as driving the page and asserting nothing when it does assert.

Area: `synthetic-journeys`

Blind case: `limits/journey-assertions-by-name.blind.mjs`
, reporting `journey-asserts-navigation-only@high`

Contrast case: `limits/journey-assertions-by-name.contrast.mjs`
, which is clean

### `probe-by-name`

**A probe through a wrapper of an unrecognised name is reported as no probe at all**

A dependency probe is recognised by the name of the method being called against a documented list. A handler that probes everything it should through a wrapper named something else is reported as answering without probing anything, which is the opposite of true.

Area: `health-and-readiness`

Blind case: `limits/probe-by-name.blind.mjs`
, reporting `health-ignores-dependencies@high`

Contrast case: `limits/probe-by-name.contrast.mjs`
, which is clean

### `write-probe-by-method-name`

**A read only call whose method is named like a write is reported as a write**

The write probe finding is raised from the method name against a documented list. A call that refreshes a view held in the process, named update or set, is reported as writing to the store on every request.

Area: `health-and-readiness`

Blind case: `limits/write-probe-by-method-name.blind.mjs`
, reporting `health-writes-on-every-call@low`

Contrast case: `limits/write-probe-by-method-name.contrast.mjs`
, which is clean

### `retry-budget-sequential`

**The retry budget arithmetic assumes attempts run one after another**

The worst case sequence is computed as attempts multiplied by the timeout plus the backoffs between them. A configuration that declares attempts running together has a worst case close to one timeout, and is reported as not fitting inside its interval when it does.

Area: `check-configuration`

Blind case: `limits/retry-budget-sequential.blind.json`
, reporting `check-retries-exceed-interval@high`

Contrast case: `limits/retry-budget-sequential.contrast.json`
, which is clean

### `maintenance-window-in-document`

**Silencing is looked for in the alert document and nowhere else**

The finding is raised when the document declares no maintenance windows. A team whose deploy pipeline silences alerts through the alerting system directly has a mechanism, and it is reported as having none.

Area: `alerting-and-escalation`

Blind case: `limits/maintenance-window-in-document.blind.json`
, reporting `alert-no-maintenance-window@low`

Contrast case: `limits/maintenance-window-in-document.contrast.json`
, which is clean

