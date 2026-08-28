package com.aval.assistant.tools;

import com.aval.finance.goals.GetGoalsUseCase;
import com.aval.finance.goals.GoalView;
import com.aval.household.FinancialScope;
import com.aval.household.HouseholdAccessService;
import com.aval.platform.auth.AuthenticatedUser;
import java.time.YearMonth;
import java.util.List;
import org.springframework.stereotype.Service;

/** {@code get_goals} — see {@link GetGoalsUseCase} for the actual orchestration. */
@Service
public class GetGoalsTool {

  private final HouseholdAccessService householdAccess;
  private final GetGoalsUseCase useCase;

  public GetGoalsTool(HouseholdAccessService householdAccess, GetGoalsUseCase useCase) {
    this.householdAccess = householdAccess;
    this.useCase = useCase;
  }

  public List<GoalView> execute(AuthenticatedUser user, YearMonth month, FinancialScope scope) {
    ToolExecutionContext context = ToolExecutionContext.resolve(user, householdAccess);
    return useCase.handle(context, month, scope);
  }
}
