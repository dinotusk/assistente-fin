package com.aval.finance.summary;

import com.aval.finance.Money;
import com.aval.finance.budgets.BudgetRepository;
import com.aval.finance.budgets.FinancialMonth;
import com.aval.finance.budgets.FinancialMonthRepository;
import com.aval.finance.expenses.ExpenseRepository;
import com.aval.finance.expenses.FinancialEntry;
import com.aval.household.FinancialProfile;
import com.aval.household.FinancialScope;
import com.aval.household.HouseholdAccessService;
import com.aval.platform.auth.AuthenticatedUser;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Orchestrates a single {@code GET /api/v1/financial-summary} request: resolve tenancy →
 * validate scope → load data → calculate. No calculation happens here — that is entirely
 * {@link FinancialCalculator}'s job (Fase 22: "Controller não deve fazer cálculo").
 */
@Service
public class GetFinancialSummaryUseCase {

  private final HouseholdAccessService householdAccess;
  private final FinancialMonthRepository monthRepository;
  private final BudgetRepository budgetRepository;
  private final ExpenseRepository expenseRepository;

  public GetFinancialSummaryUseCase(
      HouseholdAccessService householdAccess,
      FinancialMonthRepository monthRepository,
      BudgetRepository budgetRepository,
      ExpenseRepository expenseRepository) {
    this.householdAccess = householdAccess;
    this.monthRepository = monthRepository;
    this.budgetRepository = budgetRepository;
    this.expenseRepository = expenseRepository;
  }

  public FinancialSummary handle(AuthenticatedUser user, YearMonth month, FinancialScope scope) {
    UUID householdId = householdAccess.resolveHouseholdId(user.id());

    FinancialProfile resolvedProfile = null;
    if (scope instanceof FinancialScope.Profile(UUID profileId)) {
      resolvedProfile = householdAccess.resolveProfile(householdId, profileId);
    }

    FinancialMonth financialMonth =
        monthRepository
            .findByHouseholdAndPeriod(householdId, month)
            .orElseThrow(
                () -> new ApiException(ApiErrorType.RESOURCE_NOT_FOUND, "Mês financeiro não encontrado."));

    List<FinancialProfile> activeProfiles = householdAccess.activeProfiles(householdId);
    Map<UUID, Money> profileBudgets = budgetRepository.findByHouseholdAndMonth(householdId, financialMonth.id());
    List<FinancialEntry> allEntries = expenseRepository.findByHouseholdAndMonth(householdId, financialMonth.id());

    Money budget = FinancialCalculator.budgetFor(scope, financialMonth, profileBudgets, resolvedProfile);
    List<FinancialEntry> scopedEntries = FinancialCalculator.entriesFor(scope, allEntries, activeProfiles);

    return FinancialCalculator.summarize(scope, month, budget, scopedEntries);
  }
}
