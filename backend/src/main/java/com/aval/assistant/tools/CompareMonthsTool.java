package com.aval.assistant.tools;

import com.aval.finance.summary.CompareMonthsUseCase;
import com.aval.finance.summary.MonthComparisonResult;
import com.aval.household.FinancialScope;
import com.aval.household.HouseholdAccessService;
import com.aval.platform.auth.AuthenticatedUser;
import java.time.YearMonth;
import org.springframework.stereotype.Service;

/** {@code compare_months} — see {@link CompareMonthsUseCase} for the actual orchestration. */
@Service
public class CompareMonthsTool {

  private final HouseholdAccessService householdAccess;
  private final CompareMonthsUseCase useCase;

  public CompareMonthsTool(HouseholdAccessService householdAccess, CompareMonthsUseCase useCase) {
    this.householdAccess = householdAccess;
    this.useCase = useCase;
  }

  public MonthComparisonResult execute(
      AuthenticatedUser user, YearMonth monthA, YearMonth monthB, FinancialScope scope) {
    ToolExecutionContext context = ToolExecutionContext.resolve(user, householdAccess);
    return useCase.handle(context, monthA, monthB, scope);
  }
}
