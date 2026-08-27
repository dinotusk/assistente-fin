/**
 * Financial domain boundary — where the PWA's {@code calc.ts} rules
 * (P0-FINANCIAL-TRUTH) get a deliberate Java translation, not a rewrite
 * from scratch (P2-FINANCIAL-DOMAIN — parity before improvement; see
 * docs/architecture/financial-domain.md for the full parity matrix and
 * decision log). Every value {@link com.aval.finance.summary.FinancialSummary}
 * produces is tagged recorded/calculated (see {@link
 * com.aval.finance.summary.Provenance}) so callers — the API, and later the
 * Assistant's Financial Tools — never have to guess a number's origin.
 *
 * <p>{@link com.aval.finance.Money}/{@link com.aval.finance.Categories} live directly in this
 * package as shared domain primitives; {@link com.aval.finance.expenses} and {@link
 * com.aval.finance.budgets} hold the two source-data slices, and {@link com.aval.finance.summary}
 * is where they're combined (the calculator, the read-only use case, and the API controller).
 * {@link com.aval.finance.income}, {@link com.aval.finance.goals}, {@link
 * com.aval.finance.simulations} remain empty boundaries this round — priorities/goals and
 * simulation are out of scope for P2 (read-only financial-summary only).
 */
package com.aval.finance;
