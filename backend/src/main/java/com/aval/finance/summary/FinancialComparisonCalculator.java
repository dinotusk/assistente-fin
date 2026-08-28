package com.aval.finance.summary;

import com.aval.finance.Categories;
import com.aval.finance.Money;
import com.aval.finance.Percent;
import java.util.List;
import java.util.Map;

/**
 * Pure {@code compare_months} math — takes two already-computed {@link FinancialSummary}s (each
 * built by {@link FinancialCalculator#summarize}, never re-derived here) plus each month's full
 * category breakdown ({@link FinancialCalculator#categoryTotals}), and produces deltas. No SQL,
 * no repository access, no re-implementation of {@code calc()}'s formulas — every scalar this
 * class compares is a number {@link FinancialCalculator} already produced.
 */
public final class FinancialComparisonCalculator {

  private FinancialComparisonCalculator() {}

  public static Money delta(Money a, Money b) {
    return b.subtract(a);
  }

  public static Percent deltaPercent(Money a, Money b) {
    return Percent.ofDelta(delta(a, b).value(), a.value());
  }

  /**
   * One row per category in {@link Categories#ORDER} that has a non-zero total in at least one of
   * the two months — a category with zero in both is omitted (there is nothing to compare), never
   * fabricated as a {@code 0 → 0} row.
   */
  public static List<CategoryComparison> compareCategories(
      List<CategoryTotal> categoriesA, List<CategoryTotal> categoriesB) {
    Map<String, Money> totalsA = toMap(categoriesA);
    Map<String, Money> totalsB = toMap(categoriesB);
    return Categories.ORDER.stream()
        .filter(category -> totalsA.containsKey(category) || totalsB.containsKey(category))
        .map(
            category -> {
              Money a = totalsA.getOrDefault(category, Money.ZERO);
              Money b = totalsB.getOrDefault(category, Money.ZERO);
              return new CategoryComparison(category, a, b, delta(a, b), deltaPercent(a, b));
            })
        .toList();
  }

  private static Map<String, Money> toMap(List<CategoryTotal> categories) {
    return categories.stream().collect(java.util.stream.Collectors.toMap(CategoryTotal::category, CategoryTotal::total));
  }
}
