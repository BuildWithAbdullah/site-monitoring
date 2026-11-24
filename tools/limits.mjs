// The limits manifest.
//
// A limit is something these checkers cannot see, written down, with two
// artefacts proving it is real rather than theoretical.
//
//   blind     the case the limit applies to
//   contrast  the same situation in a form the checkers do read
//
// `kind` says which way the limit cuts, and the two kinds mean opposite things,
// so the suite asserts them separately and in both directions:
//
//   hides         the blind case reports NOTHING when there is something to
//                 report. A problem is invisible. The suite requires the blind
//                 case to be clean and the contrast case to report, because a
//                 contrast case that reports nothing proves nothing: a file
//                 with no problem in it also reports nothing.
//   manufactures  the blind case reports something that is NOT a problem. The
//                 suite requires the blind case to report exactly the stated
//                 tokens and the contrast case to be clean.

export const LIMIT_KINDS = ['hides', 'manufactures'];

export const LIMITS = [
  {
    slug: 'unknown-config-shape',
    kind: 'hides',
    area: 'check-configuration',
    title: 'A configuration document whose top level keys match no known shape is not audited',
    detail:
      'Documents are recognised by their top level keys, because the same file is called twelve different things by twelve different tools. A document that wraps its checks under a vendor key is skipped entirely, and the skip is reported, but nothing inside it is read.',
    blind: 'unknown-config-shape.blind.json',
    contrast: 'unknown-config-shape.contrast.json',
    blindExpected: [],
    contrastExpected: [
      'check-no-timeout@high',
      'check-asserts-status-only@medium',
      'check-tls-expiry-unmonitored@medium',
      'check-single-vantage-point@low',
      'check-dns-unmonitored@low',
    ],
  },
  {
    slug: 'checks-built-in-code',
    kind: 'hides',
    area: 'check-configuration',
    title: 'A check list assembled in code is invisible to the configuration checks',
    detail:
      'Area B reads declared values. A check list built by a loop at run time has no declared values to read, so none of the interval, timeout or expectation rules apply to it. This is the single largest blind spot in the repository and the reason the documented input kind is a declarative document.',
    blind: 'checks-built-in-code.blind.mjs',
    contrast: 'checks-built-in-code.contrast.json',
    blindExpected: [],
    contrastExpected: [
      'check-no-timeout@high',
      'check-asserts-status-only@medium',
      'check-tls-expiry-unmonitored@medium',
      'check-single-vantage-point@low',
      'check-dns-unmonitored@low',
    ],
  },
  {
    slug: 'yaml-flow-sequence',
    kind: 'hides',
    area: 'scheduled-runner',
    title: 'Steps written as a flow sequence are not read',
    detail:
      'The workflow reader handles block mappings, block sequences and plain or quoted scalars. A flow collection is recorded as unread and its contents are not judged, so a job whose steps are written inline is not audited at all.',
    blind: 'yaml-flow-sequence.blind.yml',
    contrast: 'yaml-flow-sequence.contrast.yml',
    blindExpected: [],
    contrastExpected: ['runner-continue-on-error@high'],
  },
  {
    slug: 'dynamic-code',
    kind: 'hides',
    area: 'health-and-readiness',
    title: 'Code assembled in a string and compiled at run time is not read',
    detail:
      'Every scanner runs on a masked copy in which the contents of strings are blanked, which is what stops a scanner reading code quoted inside a test fixture. The same masking means a handler body built as a string and passed to a compiler is invisible.',
    blind: 'dynamic-code.blind.mjs',
    contrast: 'dynamic-code.contrast.mjs',
    blindExpected: [],
    contrastExpected: ['health-ignores-dependencies@high'],
  },
  {
    slug: 'single-file-scope',
    kind: 'hides',
    area: 'rum-and-error-reporting',
    title: 'One file is audited at a time, so a call into another module is not followed',
    detail:
      'A handler name or an init call that lives in another module is not resolved. A handler passed by name within the same file is resolved, which is what lets one handler registered at two paths be recognised, but nothing crosses a module boundary.',
    blind: 'single-file-scope.blind.mjs',
    contrast: 'single-file-scope.contrast.mjs',
    blindExpected: [],
    contrastExpected: ['rum-init-before-consent@high'],
  },
  {
    slug: 'durations-need-units',
    kind: 'hides',
    area: 'check-configuration',
    title: 'A duration whose key carries no unit is not read',
    detail:
      'Every comparison in area B is arithmetic, and guessing between seconds and milliseconds is wrong by three orders of magnitude. A bare interval or timeout key is left alone, which means neither the missing timeout finding nor any of the interval arithmetic applies to it. A declared blind spot is better than a confident wrong answer.',
    blind: 'durations-need-units.blind.json',
    contrast: 'durations-need-units.contrast.json',
    blindExpected: [],
    contrastExpected: ['check-timeout-not-less-than-interval@high'],
  },
  {
    slug: 'cron-descriptors',
    kind: 'hides',
    area: 'scheduled-runner',
    title: 'A schedule written as a descriptor has no period this reader can work out',
    detail:
      'The cron reader handles the five field form with wildcards, steps and fixed values. A descriptor, a sixth field or a day of week constraint produces no period, so the comparison between the schedule and the interval it is meant to deliver is skipped.',
    blind: 'cron-descriptors.blind.yml',
    contrast: 'cron-descriptors.contrast.yml',
    blindExpected: [],
    contrastExpected: ['runner-cron-slower-than-interval@high'],
  },
  {
    slug: 'interval-not-declared',
    kind: 'hides',
    area: 'scheduled-runner',
    title: 'A workflow that does not say what interval it serves cannot be checked against it',
    detail:
      'The comparison needs both numbers. The schedule is in the workflow, and the interval is usually in the configuration the workflow runs, which is a different file. A workflow that declares the interval it serves in its environment can be checked; one that does not is left alone.',
    blind: 'interval-not-declared.blind.yml',
    contrast: 'interval-not-declared.contrast.yml',
    blindExpected: [],
    contrastExpected: ['runner-cron-slower-than-interval@high'],
  },
  {
    slug: 'alert-linkage-by-id',
    kind: 'hides',
    area: 'alerting-and-escalation',
    title: 'An alert that selects its check by a tag is not linked to that check',
    detail:
      'The interval against window comparison needs to know which check an alert is about, and the only linkage it reads is an explicit check identifier. An alert that selects by tag, label or expression is not linked, so the comparison does not happen.',
    blind: 'alert-linkage-by-id.blind.json',
    contrast: 'alert-linkage-by-id.contrast.json',
    blindExpected: [],
    contrastExpected: ['check-interval-exceeds-alert-window@high'],
  },
  {
    slug: 'pii-shapes-enumerated',
    kind: 'hides',
    area: 'rum-and-error-reporting',
    title: 'Personal data is recognised by documented shapes only',
    detail:
      'The payload check knows about cookies, raw URLs and a documented list of field names. A custom identifier that identifies a person is not recognised, and the check has no way to learn what a given system considers identifying.',
    blind: 'pii-shapes-enumerated.blind.mjs',
    contrast: 'pii-shapes-enumerated.contrast.mjs',
    blindExpected: [],
    contrastExpected: ['rum-pii-in-payload@high'],
  },
  {
    slug: 'check-url-not-readable',
    kind: 'hides',
    area: 'check-configuration',
    title: 'A check whose URL is not a readable URL has no scheme or host to judge',
    detail:
      'A URL written as a template placeholder, filled in by the runner from an environment variable, has no scheme and no host in the document. The plain http finding, the certificate warning window and the resolution check all depend on reading those, so none of them applies to that check.',
    blind: 'check-url-not-readable.blind.json',
    contrast: 'check-url-not-readable.contrast.json',
    blindExpected: [],
    contrastExpected: ['check-plain-http-target@medium'],
  },
  {
    slug: 'init-in-conditional',
    kind: 'hides',
    area: 'rum-and-error-reporting',
    title: 'An init inside any conditional is treated as gated, whatever the condition is',
    detail:
      'Reporting an init that sits inside a condition would mean deciding what the condition means, and an init guarded by a feature flag is not an init that runs before consent. The consequence is that an init guarded by something genuinely unrelated to consent is not reported. The alternative was a finding against correct code, which costs more.',
    blind: 'init-in-conditional.blind.mjs',
    contrast: 'init-in-conditional.contrast.mjs',
    blindExpected: [],
    contrastExpected: ['rum-init-before-consent@high'],
  },
  {
    slug: 'continue-on-error-expression',
    kind: 'hides',
    area: 'scheduled-runner',
    title: 'A permission to fail written as an expression is compared rather than evaluated',
    detail:
      'The reader compares values. A step whose continue-on-error is an expression the platform evaluates at run time is not judged, which means the most interesting version of this problem, a step allowed to fail only on the scheduled runs, is invisible. Evaluating the expression would mean implementing the platform.',
    blind: 'continue-on-error-expression.blind.yml',
    contrast: 'continue-on-error-expression.contrast.yml',
    blindExpected: [],
    contrastExpected: ['runner-continue-on-error@high'],
  },
  {
    slug: 'journey-assertions-by-name',
    kind: 'manufactures',
    area: 'synthetic-journeys',
    title: 'An assertion helper named outside the convention is not recognised as an assertion',
    detail:
      'A call named expectSomething, assertSomething or verifySomething counts as an assertion, as does waiting for a selector. A helper named anything else, in another module, is not recognised, and the journey is reported as driving the page and asserting nothing when it does assert.',
    blind: 'journey-assertions-by-name.blind.mjs',
    contrast: 'journey-assertions-by-name.contrast.mjs',
    blindExpected: ['journey-asserts-navigation-only@high'],
    contrastExpected: [],
  },
  {
    slug: 'probe-by-name',
    kind: 'manufactures',
    area: 'health-and-readiness',
    title: 'A probe through a wrapper of an unrecognised name is reported as no probe at all',
    detail:
      'A dependency probe is recognised by the name of the method being called against a documented list. A handler that probes everything it should through a wrapper named something else is reported as answering without probing anything, which is the opposite of true.',
    blind: 'probe-by-name.blind.mjs',
    contrast: 'probe-by-name.contrast.mjs',
    blindExpected: ['health-ignores-dependencies@high'],
    contrastExpected: [],
  },
  {
    slug: 'write-probe-by-method-name',
    kind: 'manufactures',
    area: 'health-and-readiness',
    title: 'A read only call whose method is named like a write is reported as a write',
    detail:
      'The write probe finding is raised from the method name against a documented list. A call that refreshes a view held in the process, named update or set, is reported as writing to the store on every request.',
    blind: 'write-probe-by-method-name.blind.mjs',
    contrast: 'write-probe-by-method-name.contrast.mjs',
    blindExpected: ['health-writes-on-every-call@low'],
    contrastExpected: [],
  },
  {
    slug: 'retry-budget-sequential',
    kind: 'manufactures',
    area: 'check-configuration',
    title: 'The retry budget arithmetic assumes attempts run one after another',
    detail:
      'The worst case sequence is computed as attempts multiplied by the timeout plus the backoffs between them. A configuration that declares attempts running together has a worst case close to one timeout, and is reported as not fitting inside its interval when it does.',
    blind: 'retry-budget-sequential.blind.json',
    contrast: 'retry-budget-sequential.contrast.json',
    blindExpected: ['check-retries-exceed-interval@high'],
    contrastExpected: [],
  },
  {
    slug: 'maintenance-window-in-document',
    kind: 'manufactures',
    area: 'alerting-and-escalation',
    title: 'Silencing is looked for in the alert document and nowhere else',
    detail:
      'The finding is raised when the document declares no maintenance windows. A team whose deploy pipeline silences alerts through the alerting system directly has a mechanism, and it is reported as having none.',
    blind: 'maintenance-window-in-document.blind.json',
    contrast: 'maintenance-window-in-document.contrast.json',
    blindExpected: ['alert-no-maintenance-window@low'],
    contrastExpected: [],
  },
];

export const LIMITS_BY_SLUG = new Map(LIMITS.map((l) => [l.slug, l]));
