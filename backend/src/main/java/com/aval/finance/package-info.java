/**
 * Financial domain boundary — where the PWA's {@code calc.ts} rules
 * (P0-FINANCIAL-TRUTH) get a deliberate Java translation, not a rewrite
 * from scratch. Every value this domain produces will be tagged recorded,
 * calculated, or estimated (see the roadmap's Fase 2) so callers — the API,
 * and later the Assistant's Financial Tools — never have to guess a
 * number's provenance.
 *
 * <p>Empty this round by design: P1 ships no financial rule migration and
 * no financial endpoints. See {@link com.aval.finance.expenses}, {@link
 * com.aval.finance.income}, {@link com.aval.finance.budgets}, {@link
 * com.aval.finance.goals}, {@link com.aval.finance.simulations} for the
 * planned sub-boundaries, and P2-FINANCIAL-DOMAIN for the first real
 * implementation.
 */
package com.aval.finance;
