package com.aval.finance;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * A percentage that might not be computable — never silently invented. Two distinct call sites
 * use this, each with its own explicit zero-denominator policy (never a shared, ambiguous default):
 *
 * <ul>
 *   <li>{@link #ofDelta} (compare_months): a period-over-period change. When the baseline is
 *       zero, "percent change from zero" is mathematically undefined — {@link NotApplicable},
 *       never a fabricated {@code 0%} or {@code 100%}.
 *   <li>{@link #ofProgressRatio} (goals): a bounded 0..100 progress ratio. A zero target is a
 *       valid, common state (a goal with no amount set yet), not an error — the existing frontend
 *       AI-context precedent ({@code ai.ts}'s GOALS branch: {@code valorAlvo > 0 ? saved/valorAlvo
 *       : 0}) already treats target=0 as progress {@code 0.00}, so this is parity, not a new
 *       invention.
 * </ul>
 *
 * Rounding policy: computed with 10 digits of intermediate precision, then the final percentage
 * is scaled to 2 decimal places, {@link RoundingMode#HALF_UP} — the same rounding mode {@link
 * Money} uses at its own parsing boundary, applied here at the one point this domain ever divides.
 */
public sealed interface Percent {

  record Value(BigDecimal percent) implements Percent {}

  record NotApplicable() implements Percent {}

  int SCALE = 2;
  java.math.MathContext INTERMEDIATE_PRECISION = new java.math.MathContext(10, RoundingMode.HALF_UP);

  /** {@code (current - baseline) / baseline * 100}. {@link NotApplicable} when {@code baseline} is zero. */
  static Percent ofDelta(BigDecimal delta, BigDecimal baseline) {
    if (baseline.signum() == 0) {
      return new NotApplicable();
    }
    BigDecimal ratio = delta.divide(baseline, INTERMEDIATE_PRECISION);
    return new Value(ratio.multiply(BigDecimal.valueOf(100)).setScale(SCALE, RoundingMode.HALF_UP));
  }

  /**
   * {@code min(100, saved / target * 100)}, or {@code 0.00} when {@code target} is zero (never
   * {@link NotApplicable} — see class javadoc). Never negative: a negative {@code saved} is not a
   * shape this domain produces ({@code priorities.saved_amount >= 0} is a database constraint).
   */
  static Percent ofProgressRatio(BigDecimal saved, BigDecimal target) {
    if (target.signum() == 0) {
      return new Value(BigDecimal.ZERO.setScale(SCALE, RoundingMode.HALF_UP));
    }
    BigDecimal ratio = saved.divide(target, INTERMEDIATE_PRECISION).multiply(BigDecimal.valueOf(100));
    BigDecimal capped = ratio.min(BigDecimal.valueOf(100));
    return new Value(capped.setScale(SCALE, RoundingMode.HALF_UP));
  }
}
