package com.aval.assistant.tools;

import com.aval.finance.expenses.EntryType;
import com.aval.finance.expenses.ExpensePage;
import com.aval.finance.expenses.ExpenseStatus;
import com.aval.finance.expenses.ListExpensesUseCase;
import com.aval.household.FinancialScope;
import com.aval.household.HouseholdAccessService;
import com.aval.platform.auth.AuthenticatedUser;
import java.time.YearMonth;
import java.util.Optional;
import org.springframework.stereotype.Service;

/** {@code get_expenses} — see {@link ListExpensesUseCase} for the actual orchestration. */
@Service
public class GetExpensesTool {

  private final HouseholdAccessService householdAccess;
  private final ListExpensesUseCase useCase;

  public GetExpensesTool(HouseholdAccessService householdAccess, ListExpensesUseCase useCase) {
    this.householdAccess = householdAccess;
    this.useCase = useCase;
  }

  public ExpensePage execute(
      AuthenticatedUser user,
      YearMonth month,
      FinancialScope scope,
      Optional<String> category,
      Optional<ExpenseStatus> status,
      Optional<EntryType> entryType,
      int page,
      int pageSize) {
    ToolExecutionContext context = ToolExecutionContext.resolve(user, householdAccess);
    return useCase.handle(context, month, scope, category, status, entryType, page, pageSize);
  }
}
