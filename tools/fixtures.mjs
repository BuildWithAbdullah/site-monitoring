// The fixture manifest.
//
// A fixture exists for one reason only: a finding that no pair reaches. One per
// such reason and no more, because a fixture that reaches a reason a pair
// already reaches is two artefacts carrying one claim, and the second one will
// be the one nobody updates.
//
// This list is empty, and that is the point. Every one of the catalogued
// findings is reached by a pattern pair, so every finding in this repository
// has a corrected example beside it rather than a bare demonstration. The suite
// asserts that this list has exactly as many entries as there are declared
// `id@severity` tokens the pairs do not reach, which keeps the list honest in
// both directions: add a finding with no pair and the build demands a fixture,
// add a fixture for something a pair already covers and the build refuses it.

export const FIXTURES = [];

export const FIXTURES_BY_SLUG = new Map(FIXTURES.map((f) => [f.slug, f]));

// A finding that can be emitted at two severities sometimes needs a second
// artefact to reach the second one, and such a fixture is an exception to the
// one-per-reason rule. Every exception has to be named here. The list is empty
// because all three two-severity findings in this catalogue reach both of their
// severities through pairs.
export const SECOND_SEVERITY_EXCEPTIONS = [];
