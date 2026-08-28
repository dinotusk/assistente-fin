package com.aval.finance.summary;

import com.aval.assistant.tools.ToolExecutionContext;
import com.aval.finance.Money;
import com.aval.finance.budgets.BudgetRepository;
import com.aval.finance.budgets.FinancialMonth;
import com.aval.finance.budgets.FinancialMonthRepository;
import com.aval.finance.expenses.EntryType;
import com.aval.finance.expenses.ExpenseRepository;
import com.aval.finance.expenses.FinancialEntry;
import com.aval.household.FinancialProfile;
import com.aval.household.FinancialScope;
import com.aval.household.HouseholdAccessService;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Orchestrates {@code compare_months}: resolve tenancy once → load each month's data with a few
 * predictable queries (never one query per category — see {@link
 * FinancialComparisonCalculator#compareCategories}, which works entirely in memory over data
 * already fetched by {@link #loadMonth}) → let {@link FinancialCalculator}/{@link
 * FinancialComparisonCalculator} do every calculation.
 *
 * <p>Query shape per call, household-scoped work shared across both months: 1 (household
 * resolution, done by {@link ToolExecutionContext#resolve}) + up to 1 (profile validation, only
 * for {@code scope=profile}) + 1 (active profiles, shared) + 2×(1 month lookup + 1 budgets + 1
 * expenses) = 8–9 total, never growing with the number of categories or expenses.
 */
@Service
public class CompareMonthsUseCase {

  private final HouseholdAccessService householdAccess;
  private final FinancialMonthRepository monthRepository;
  private final BudgetRepository budgetRepository;
  private final ExpenseRepository expenseRepository;

  public CompareMonthsUseCase(
      HouseholdAccessService householdAccess,
      FinancialMonthRepository monthRepository,
      BudgetRepository budgetRepository,
      ExpenseRepository expenseRepository) {
    this.householdAccess = householdAccess;
    this.monthRepository = monthRepository;
    this.budgetRepository = budgetRepository;
    this.expenseRepository = expenseRepository;
  }

  public MonthComparisonResult handle(
      ToolExecutionContext context, YearMonth monthA, YearMonth monthB, FinancialScope scope) {
    UUID householdId = context.householdId();

    List<FinancialProfile> activeProfiles = householdAccess.activeProfiles(householdId);
    FinancialProfile resolvedProfile =
        scope instanceof FinancialScope.Profile(UUID profileId)
            ? householdAccess.resolveProfile(householdId, profileId)
            : null;

    MonthLoad loadA = loadMonth(householdId, monthA, scope, activeProfiles, resolvedProfile);
    MonthLoad loadB = loadMonth(householdId, monthB, scope, activeProfiles, resolvedProfile);

    Money expensesDelta = FinancialComparisonCalculator.delta(loadA.summary.total().value(), loadB.summary.total().value());
    Money budgetDelta = FinancialComparisonCalculator.delta(loadA.summary.budget().value(), loadB.summary.budget().value());
    Money freeDelta = FinancialComparisonCalculator.delta(loadA.summary.free().value(), loadB.summary.free().value());
    Money receivedDelta = FinancialComparisonCalculator.delta(loadA.summary.received().value(), loadB.summary.received().value());

    return new MonthComparisonResult(
        loadA.summary,
        loadB.summary,
        loadA.categories,
        loadB.categories,
        FinancialComparisonCalculator.compareCategories(loadA.categories, loadB.categories),
        expensesDelta,
        FinancialComparisonCalculator.deltaPercent(loadA.summary.total().value(), loadB.summary.total().value()),
        budgetDelta,
        FinancialComparisonCalculator.deltaPercent(loadA.summary.budget().value(), loadB.summary.budget().value()),
        freeDelta,
        FinancialComparisonCalculator.deltaPercent(loadA.summary.free().value(), loadB.summary.free().value()),
        receivedDelta,
        FinancialComparisonCalculator.deltaPercent(loadA.summary.received().value(), loadB.summary.received().value()));
  }

  private MonthLoad loadMonth(
      UUID householdId,
      YearMonth period,
      FinancialScope scope,
      List<FinancialProfile> activeProfiles,
      FinancialProfile resolvedProfile) {
    FinancialMonth financialMonth =
        monthRepository
            .findByHouseholdAndPeriod(householdId, period)
            .orElseThrow(
                () ->
                    new ApiException(
                        ApiErrorType.RESOURCE_NOT_FOUND, "Mês financeiro não encontrado: " + period));

    Map<UUID, Money> profileBudgets = budgetRepository.findByHouseholdAndMonth(householdId, financialMonth.id());
    List<FinancialEntry> allEntries = expenseRepository.findByHouseholdAndMonth(householdId, financialMonth.id());

    Money budget = FinancialCalculator.budgetFor(scope, financialMonth, profileBudgets, resolvedProfile);
    List<FinancialEntry> scopedEntries = FinancialCalculator.entriesFor(scope, allEntries, activeProfiles);
    List<FinancialEntry> expensesOnly = scopedEntries.stream().filter(e -> e.type() != EntryType.INCOME).toList();

    FinancialSummary summary = FinancialCalculator.summarize(scope, period, budget, scopedEntries);
    List<CategoryTotal> categories = FinancialCalculator.categoryTotals(expensesOnly);

    return new MonthLoad(summary, categories);
  }

  private record MonthLoad(FinancialSummary summary, List<CategoryTotal> categories) {}
}
