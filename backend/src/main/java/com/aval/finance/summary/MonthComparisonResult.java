package com.aval.finance.summary;

import com.aval.finance.Money;
import com.aval.finance.Percent;
import java.util.List;

/** {@code get_financial_summary}'s two-month sibling — see {@code CompareMonthsUseCase}. */
public record MonthComparisonResult(
    FinancialSummary monthA,
    FinancialSummary monthB,
    List<CategoryTotal> categoriesA,
    List<CategoryTotal> categoriesB,
    List<CategoryComparison> categoryDeltas,
    Money expensesDelta,
    Percent expensesDeltaPercent,
    Money budgetDelta,
    Percent budgetDeltaPercent,
    Money freeDelta,
    Percent freeDeltaPercent,
    Money receivedDelta,
    Percent receivedDeltaPercent) {}
