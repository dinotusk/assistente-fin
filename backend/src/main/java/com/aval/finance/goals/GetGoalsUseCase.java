package com.aval.finance.goals;

import com.aval.assistant.tools.ToolExecutionContext;
import com.aval.finance.budgets.FinancialMonth;
import com.aval.finance.budgets.FinancialMonthRepository;
import com.aval.finance.summary.FinancialCalculator;
import com.aval.household.FinancialProfile;
import com.aval.household.FinancialScope;
import com.aval.household.HouseholdAccessService;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Orchestrates {@code get_goals}: resolve tenancy → resolve month → load priorities → filter by
 * scope → calculate progress. No calculation happens here — see {@link PriorityCalculator}
 * (same "use case doesn't calculate" rule {@code GetFinancialSummaryUseCase} already follows).
 */
@Service
public class GetGoalsUseCase {

  private final HouseholdAccessService householdAccess;
  private final FinancialMonthRepository monthRepository;
  private final PriorityRepository priorityRepository;

  public GetGoalsUseCase(
      HouseholdAccessService householdAccess,
      FinancialMonthRepository monthRepository,
      PriorityRepository priorityRepository) {
    this.householdAccess = householdAccess;
    this.monthRepository = monthRepository;
    this.priorityRepository = priorityRepository;
  }

  public List<GoalView> handle(ToolExecutionContext context, YearMonth month, FinancialScope scope) {
    UUID householdId = context.householdId();

    if (scope instanceof FinancialScope.Profile(UUID profileId)) {
      householdAccess.resolveProfile(householdId, profileId);
    }

    FinancialMonth financialMonth =
        monthRepository
            .findByHouseholdAndPeriod(householdId, month)
            .orElseThrow(
                () -> new ApiException(ApiErrorType.RESOURCE_NOT_FOUND, "Mês financeiro não encontrado."));

    List<FinancialProfile> activeProfiles = householdAccess.activeProfiles(householdId);
    List<Priority> allPriorities = priorityRepository.findByHouseholdAndMonth(householdId, financialMonth.id());
    List<Priority> scoped = FinancialCalculator.prioritiesFor(scope, allPriorities, activeProfiles);

    return scoped.stream().map(PriorityCalculator::toView).toList();
  }
}
