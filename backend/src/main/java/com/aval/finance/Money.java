package com.aval.finance;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;

/**
 * A monetary amount, scaled to exactly 2 decimal places — mirrors every
 * money column in the schema ({@code numeric(14,2)}: {@code
 * expenses.amount}, {@code finance_months.income}/{@code
 * house_contribution}, {@code profile_budgets.amount}), all confirmed
 * {@code NOT NULL} (P2-FINANCIAL-DOMAIN inspected the live schema — see
 * docs/architecture/financial-domain.md). {@code Money} therefore never
 * represents "no value" — absence (e.g. a household with no budget row for
 * a profile) is a repository-level concern (default to {@link #ZERO}), not
 * something this type models.
 *
 * <p>None of the ported calc.ts rules (budgetForView, calc, getCategoryTotals)
 * multiply or divide a money value — only add, subtract, and compare — so no
 * intermediate rounding is ever actually invoked by {@link #add}/{@link
 * #subtract}: two scale-2 values combine to an exact scale-2 result.
 * {@link #of(BigDecimal)}'s {@link RoundingMode#HALF_UP} only guards the
 * boundary (parsing an external value, e.g. a request body), never domain
 * arithmetic.
 */
public final class Money implements Comparable<Money> {

  private static final int SCALE = 2;

  public static final Money ZERO = new Money(BigDecimal.ZERO.setScale(SCALE, RoundingMode.HALF_UP));

  private final BigDecimal amount;

  private Money(BigDecimal amount) {
    this.amount = amount;
  }

  public static Money of(BigDecimal amount) {
    if (amount == null) throw new IllegalArgumentException("amount must not be null");
    return new Money(amount.setScale(SCALE, RoundingMode.HALF_UP));
  }

  public static Money of(String amount) {
    return of(new BigDecimal(amount));
  }

  public static Money of(long amount) {
    return of(BigDecimal.valueOf(amount));
  }

  public Money add(Money other) {
    return new Money(this.amount.add(other.amount));
  }

  public Money subtract(Money other) {
    return new Money(this.amount.subtract(other.amount));
  }

  public boolean isNegative() {
    return amount.signum() < 0;
  }

  public boolean isPositive() {
    return amount.signum() > 0;
  }

  public boolean isZero() {
    return amount.signum() == 0;
  }

  /** Raw decimal value — the only escape hatch for serialization/persistence; never re-derive scale from it. */
  public BigDecimal value() {
    return amount;
  }

  public static Money max(Money a, Money b) {
    return a.compareTo(b) >= 0 ? a : b;
  }

  @Override
  public int compareTo(Money other) {
    return this.amount.compareTo(other.amount);
  }

  @Override
  public boolean equals(Object obj) {
    return obj instanceof Money other && this.amount.compareTo(other.amount) == 0;
  }

  @Override
  public int hashCode() {
    return amount.stripTrailingZeros().hashCode();
  }

  @Override
  public String toString() {
    return amount.toPlainString();
  }

  /** Total order by descending value, ties broken by insertion order (stable sort) — see getCategoryTotals parity. */
  public static Comparator<Money> descending() {
    return Comparator.reverseOrder();
  }
}
