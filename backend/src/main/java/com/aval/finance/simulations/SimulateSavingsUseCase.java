package com.aval.finance.simulations;

import com.aval.assistant.tools.ToolExecutionContext;
import com.aval.finance.Money;
import com.aval.finance.budgets.FinancialMonth;
import com.aval.finance.budgets.FinancialMonthRepository;
import com.aval.finance.goals.Priority;
import com.aval.finance.goals.PriorityRepository;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.time.YearMonth;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Orchestrates {@code simulate_savings}. Reuses {@link PriorityRepository}/{@link
 * FinancialMonthRepository} (P3, unmodified) only when the caller supplies a {@code goalId} —
 * exactly the "unambiguous existing goal" case docs/architecture/simulation-engine.md's "Savings
 * data sourcing" section describes; a bare scope/month never implicitly picks "the" goal (a
 * household can have several), avoiding the silent-wrong-answer risk of guessing.
 *
 * <p>{@link SavingsSimulationCalculator} itself never touches a repository — every number it
 * receives is already resolved and tenancy-checked by the time it runs.
 */
@Service
public class SimulateSavingsUseCase {

  private final FinancialMonthRepository monthRepository;
  private final PriorityRepository priorityRepository;

  public SimulateSavingsUseCase(FinancialMonthRepository monthRepository, PriorityRepository priorityRepository) {
    this.monthRepository = monthRepository;
    this.priorityRepository = priorityRepository;
  }

  /**
   * When {@code goalId} is present, {@code targetAmount}/{@code currentSaved} come exclusively
   * from that goal (any explicit values for either are ignored) — see class javadoc. Otherwise
   * both must be supplied explicitly; {@code AssistantToolArguments}/the HTTP controller reject
   * the request before this method runs if they aren't (see {@code SimulateSavingsTool}).
   */
  public TimeToTargetResult timeToTarget(
      ToolExecutionContext context,
      YearMonth month,
      Optional<UUID> goalId,
      Money targetAmount,
      Money currentSaved,
      Money monthlyContribution) {
    if (goalId.isPresent()) {
      Priority goal = resolveGoal(context, month, goalId.get());
      return SavingsSimulationCalculator.timeToTarget(month, goal.targetAmount(), goal.savedAmount(), monthlyContribution);
    }
    return SavingsSimulationCalculator.timeToTarget(month, targetAmount, currentSaved, monthlyContribution);
  }

  public FutureValueResult futureValue(
      ToolExecutionContext context, YearMonth month, Optional<UUID> goalId, Money currentSaved, Money monthlyContribution, int months) {
    Money resolvedCurrentSaved = currentSaved;
    if (goalId.isPresent()) {
      resolvedCurrentSaved = resolveGoal(context, month, goalId.get()).savedAmount();
    }
    return SavingsSimulationCalculator.futureValue(resolvedCurrentSaved, monthlyContribution, months);
  }

  private Priority resolveGoal(ToolExecutionContext context, YearMonth month, UUID goalId) {
    UUID householdId = context.householdId();
    FinancialMonth financialMonth =
        monthRepository
            .findByHouseholdAndPeriod(householdId, month)
            .orElseThrow(() -> new ApiException(ApiErrorType.RESOURCE_NOT_FOUND, "Mês financeiro não encontrado."));
    // Scoped by (householdId, monthId) exactly like PriorityRepository's own contract — a goalId
    // from another household simply isn't in this list, never leaking whether it exists elsewhere.
    return priorityRepository.findByHouseholdAndMonth(householdId, financialMonth.id()).stream()
        .filter(p -> p.id().equals(goalId))
        .findFirst()
        .orElseThrow(() -> new ApiException(ApiErrorType.RESOURCE_NOT_FOUND, "Meta financeira não encontrada."));
  }
}
