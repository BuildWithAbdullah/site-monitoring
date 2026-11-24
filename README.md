# site-monitoring

Monitoring patterns for production websites, with a failing example beside every
corrected one.

The uncomfortable thing about monitoring is that a broken monitor and a healthy
site look identical from the outside. Both are quiet. Almost everything in this
repository is a version of that: a health endpoint that answers 200 while the
database is down, an alert that treats an absence of samples as good news, a
check whose timeout is longer than its interval so the samples that matter are
never taken, a synthetic journey that passes against an empty page, a schedule
that cannot deliver the interval the alerts were written against.

Every one of those is catalogued here, with a before and after pair you can run,
and a checker that finds it. The checkers are also the honest part: everything
they cannot see is written down, and each of those limits has two artefacts
proving it is real.

No dependencies. The whole thing runs on Node and nothing else, which is what
makes a red build mean something.

## What is in it

- **64 catalogued findings** across 7 areas. One entry per reason, never one
  per check, and each one declares the complete set of severities it can be
  emitted at.
- **39 pattern pairs**, each a failing file beside the corrected version, and
  each declaring the exact set of findings both sides produce.
- **18 declared limits**, 13 that hide a problem and 5 that manufacture a
  finding, each with a blind case and a contrast case.
- **114 corpus artefacts** in total, every one compared against the manifest as
  an exact set in both directions.
- **411 tests** and 71 repository assertions, with every claim proved
  individually non vacuous by a perturbation that has to break it.

The findings are listed in [docs/FINDINGS.md](docs/FINDINGS.md) and the limits
in [docs/LIMITS.md](docs/LIMITS.md). Both are generated from the manifests, and
CI fails if either has gone stale, because a caveat that is no longer true is
worse than no caveat at all.

## The areas

| Area | What it covers |
|---|---|
| Health and readiness endpoints | The endpoint a monitor polls, and the many ways it can report success while the thing it vouches for is broken |
| Check configuration | Intervals, timeouts, retries, expectations and vantage points, and the arithmetic between them |
| Alerting and escalation | Thresholds, grouping, no data handling, routing, recovery, and whether anything watches the monitor itself |
| Real user monitoring | Client instrumentation that changes the metric it measures, or sends more than it should |
| Synthetic journeys | Scripted sessions against a real site, and what they leave behind |
| The scheduled runner | The workflow that runs the checks, which is the thing nobody monitors |
| Baselines and regression diffs | Comparing one run against the last one, where the identity of a finding is the whole problem |

## What it reads

Five input kinds, and two of them are configuration rather than code, because a
check that runs every fifteen minutes against a five minute alert window is
invisible in any amount of source:

- JavaScript: health handlers, instrumentation, journeys and diff scripts
- a JSON document declaring checks
- a JSON document declaring alerts
- a JSON document recording a previous run
- the YAML workflow that runs the monitors

## Running it

```sh
node bin/site-monitoring.mjs monitors
node bin/site-monitoring.mjs monitors/checks.json --json
```

A path can be a file or a directory to walk. Exit codes are derived from the
worst severity present rather than from a list kept anywhere: 0 when nothing was
found, 1 when nothing high was found, 2 when something high was, and 64 when the
command line could not be understood. That last one matters more than it looks:
a typo in a scheduled job that exited 0 would read as a site with nothing wrong
with it.

## Verifying

```sh
npm test            # the suite
npm run verify      # every named claim in the fixed list
npm run docs:check  # the generated documents are not stale
npm run exit-codes  # the real binary, over the whole corpus
```

`npm run verify` is the interesting one. It is a fixed list of named claims,
each of which loads the tree it was given by dynamic import rather than reading
the modules the verifier itself imported. That distinction is not academic. An
earlier version compared its own statically imported catalogue and manifests
against files under whatever root it was handed, which answers correctly about
the repository it lives in and tells you nothing about the tree you gave it.
Every gate was green while it did so, and the only thing that found it was
copying the tree, editing a manifest in the copy, and watching the matching
claim pass.

That is now a standing part of the suite. `test/perturb.test.mjs` copies the
repository 26 ways, makes one named change to each copy, and runs the single
claim that change should break against both. It has to pass on the unchanged
copy and fail on the perturbed one. A claim nothing can break is a claim that is
not checking anything.

One more step happens after all of that is green, because green is where the
interesting defects hide. Twenty five awkward inputs were put through the
finished checkers by hand: a probe called on a loop variable, a null entry in an
alert list, a status expectation written as a bare number rather than a list, a
beacon sent through a local helper, a monitoring workflow with an unrelated tidy
up job beside its monitors, a byte order mark. That sweep produced ten defects
and four more declared limits, and every one of the ten has a regression test
named after what went wrong rather than after the rule, because the rule was
already there and was the thing that was broken.

CI runs seven jobs: the suite on three Node versions, the verifier, the
generated documents, and both halves of the engines floor. The second half of
that last pair is the one worth explaining. Installing at the declared floor
proves nothing on its own, because the install would succeed whether or not the
floor is being enforced, so a separate job raises the floor beyond the runtime
and requires the install to be refused.

## What it cannot do

Read [docs/LIMITS.md](docs/LIMITS.md) before trusting a clean result. The short
version is that this reads declared values and static code, so a check list
assembled by a loop at run time is invisible to it, a duration whose key does
not carry its unit is left alone rather than guessed at, and a dependency probe
called through a wrapper it does not recognise is reported as no probe at all.

Four of the limits are of that last kind: they do not hide a problem, they
manufacture a finding that is not there. Those are stated as plainly as the
others, because a tool whose false positives are undocumented costs more
attention than it saves.

There is no parser here. The JavaScript readers work on a masked copy of the
source in which the interior of every string, template literal and regular
expression and the whole of every comment has been replaced by spaces of the
same length, so offsets and line numbers still line up while nothing quoted can
be read as code. The YAML reader understands block mappings, block sequences and
plain or quoted scalars. Writing those limits down produced five of the
eighteen.

One thing the masker does by heuristic rather than by rule: whether a slash
begins a regular expression or a division is decided from the previous
significant character, which is the usual approach and is wrong for a small
number of real programs. There is a test pinning the current behaviour on both
readings.

## Patterns only

Nothing here comes from a delivered engagement. Every host in every example is a
reserved name under RFC 2606 or RFC 6761, and a claim in the verifier asserts
that, along with the absence of anything shaped like an account identifier. The
commit references in the example workflows are illustrative.

## Licence

MIT. No attribution required.
