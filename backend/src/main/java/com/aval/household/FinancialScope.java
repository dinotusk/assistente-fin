package com.aval.household;

/**
 * Which slice of a household's financial data a request asks for — replaces
 * calc.ts's magic strings ({@code VIEW_ME}/{@code VIEW_ALL}/a profile name)
 * with a closed, typed set. Deliberately does NOT carry a fourth "spouse"
 * variant: the PWA's {@code VIEW_SPOUSE} is not a distinct concept, only a
 * shorthand for "the profile at position 1" — see {@link FinancialProfile}
 * and {@code FinancialCalculator}, which resolve {@link Profile} by {@code
 * sortOrder} (0 = the {@code VIEW_ME} formula, 1 = the historical {@code
 * VIEW_SPOUSE} formula, 2+ = the named-profile-budget formula), exactly
 * mirroring {@code people[index]} in calc.ts.
 *
 * <p><b>{@link Me} is a per-household UI selection, not a per-authenticated-
 * user-owned profile</b> — in the current product, "me" always resolves to
 * the household's {@code sortOrder=0} profile regardless of which of the
 * household's members (which authenticated login) is asking, exactly like
 * calc.ts's {@code resolveViewOwner}, which never looks at the caller's
 * identity at all. Any authenticated member of a household may query any
 * scope within that household — parity with the PWA, not a new capability.
 * See docs/architecture/financial-domain.md "Known decisions".
 */
public sealed interface FinancialScope {

  record Me() implements FinancialScope {}

  record Household() implements FinancialScope {}

  /** {@code profileId} — never a display name — is the only accepted identifier; see ADR-004 addendum. */
  record Profile(java.util.UUID profileId) implements FinancialScope {}
}
