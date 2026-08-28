package com.aval.assistant.tools;

import com.aval.finance.summary.CategoryComparison;
import com.aval.finance.summary.CategoryTotal;
import com.aval.finance.summary.FinancialSummaryResponse;
import com.aval.finance.summary.MonthComparisonResult;
import java.util.List;

/** The wire shape for {@code GET /api/v1/tools/compare-months}. */
public record CompareMonthsResponse(
    FinancialSummaryResponse monthA,
    FinancialSummaryResponse monthB,
    List<FinancialSummaryResponse.CategoryTotalResponse> categoriesA,
    List<FinancialSummaryResponse.CategoryTotalResponse> categoriesB,
    List<CategoryDeltaResponse> categoryDeltas,
    FinancialSummaryResponse.MoneyResponse expensesDelta,
    PercentResponse expensesDeltaPercent,
    FinancialSummaryResponse.MoneyResponse budgetDelta,
    PercentResponse budgetDeltaPercent,
    FinancialSummaryResponse.MoneyResponse freeDelta,
    PercentResponse freeDeltaPercent,
    FinancialSummaryResponse.MoneyResponse receivedDelta,
    PercentResponse receivedDeltaPercent) {

  public record CategoryDeltaResponse(
      String category, String totalA, String totalB, String delta, PercentResponse deltaPercent) {}

  public static CompareMonthsResponse from(MonthComparisonResult result) {
    return new CompareMonthsResponse(
        FinancialSummaryResponse.from(result.monthA()),
        FinancialSummaryResponse.from(result.monthB()),
        categoryResponsesOf(result.categoriesA()),
        categoryResponsesOf(result.categoriesB()),
        result.categoryDeltas().stream().map(CompareMonthsResponse::deltaOf).toList(),
        moneyOf(result.expensesDelta()),
        PercentResponse.from(result.expensesDeltaPercent()),
        moneyOf(result.budgetDelta()),
        PercentResponse.from(result.budgetDeltaPercent()),
        moneyOf(result.freeDelta()),
        PercentResponse.from(result.freeDeltaPercent()),
        moneyOf(result.receivedDelta()),
        PercentResponse.from(result.receivedDeltaPercent()));
  }

  private static List<FinancialSummaryResponse.CategoryTotalResponse> categoryResponsesOf(List<CategoryTotal> categories) {
    return categories.stream()
        .map(c -> new FinancialSummaryResponse.CategoryTotalResponse(c.category(), c.total().value().toPlainString()))
        .toList();
  }

  private static CategoryDeltaResponse deltaOf(CategoryComparison comparison) {
    return new CategoryDeltaResponse(
        comparison.category(),
        comparison.totalA().value().toPlainString(),
        comparison.totalB().value().toPlainString(),
        comparison.delta().value().toPlainString(),
        PercentResponse.from(comparison.deltaPercent()));
  }

  private static FinancialSummaryResponse.MoneyResponse moneyOf(com.aval.finance.Money money) {
    return new FinancialSummaryResponse.MoneyResponse(money.value().toPlainString(), "CALCULATED");
  }
}
