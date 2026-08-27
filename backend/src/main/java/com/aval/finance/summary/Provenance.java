package com.aval.finance.summary;

/**
 * Where a number in a {@link FinancialSummary} came from — lets the future Assistant/Financial
 * Tools (P3) tell a stored fact from a derived one without guessing. P2 only ever produces
 * {@link #RECORDED} (a value read as-is from a single column) or {@link #CALCULATED} (an
 * aggregate/derived value); {@code ESTIMATED} and {@code RECOMMENDED} are not implemented this
 * round — see docs/architecture/financial-domain.md.
 */
public enum Provenance {
  RECORDED,
  CALCULATED,
  ESTIMATED,
  RECOMMENDED
}
