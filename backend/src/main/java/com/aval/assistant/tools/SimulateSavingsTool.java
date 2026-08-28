package com.aval.assistant.tools;

import com.aval.finance.Money;
import com.aval.finance.simulations.FutureValueResult;
import com.aval.finance.simulations.SimulateSavingsUseCase;
import com.aval.finance.simulations.TimeToTargetResult;
import com.aval.household.HouseholdAccessService;
import com.aval.platform.auth.AuthenticatedUser;
import java.time.YearMonth;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** {@code simulate_savings} — thin adapter over {@link SimulateSavingsUseCase}. */
@Service
public class SimulateSavingsTool {

  private final HouseholdAccessService householdAccess;
  private final SimulateSavingsUseCase useCase;

  public SimulateSavingsTool(HouseholdAccessService householdAccess, SimulateSavingsUseCase useCase) {
    this.householdAccess = householdAccess;
    this.useCase = useCase;
  }

  public TimeToTargetResult timeToTarget(
      AuthenticatedUser user, YearMonth month, Optional<UUID> goalId, Money targetAmount, Money currentSaved, Money monthlyContribution) {
    ToolExecutionContext context = ToolExecutionContext.resolve(user, householdAccess);
    return useCase.timeToTarget(context, month, goalId, targetAmount, currentSaved, monthlyContribution);
  }

  public FutureValueResult futureValue(
      AuthenticatedUser user, YearMonth month, Optional<UUID> goalId, Money currentSaved, Money monthlyContribution, int months) {
    ToolExecutionContext context = ToolExecutionContext.resolve(user, householdAccess);
    return useCase.futureValue(context, month, goalId, currentSaved, monthlyContribution, months);
  }
}
