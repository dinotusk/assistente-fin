package com.aval.assistant.tools;

import com.aval.finance.expenses.EntryType;
import com.aval.finance.expenses.ExpensePage;
import com.aval.finance.expenses.ExpenseStatus;
import com.aval.household.FinancialScope;
import com.aval.platform.auth.AuthenticatedUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.YearMonth;
import java.util.Optional;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** {@code get_expenses} as an HTTP tool endpoint. Read-only, paginated, tenant-scoped — see {@code ListExpensesUseCase}. */
@RestController
public class GetExpensesController {

  private final GetExpensesTool tool;

  public GetExpensesController(GetExpensesTool tool) {
    this.tool = tool;
  }

  @Operation(
      summary = "Financial Tool: get_expenses",
      description =
          "Read-only, paginated listing of expenses/income for one month/scope. Ordered most "
              + "recent first (expense_date desc, id desc as a stable tiebreak). `entryType` "
              + "distinguishes expense rows from income rows — income is never counted as a gasto.")
  @GetMapping("/api/v1/tools/expenses")
  public ExpensesResponse expenses(
      @AuthenticationPrincipal Jwt jwt,
      @Parameter(description = "YYYY-MM", example = "2026-08") @RequestParam String month,
      @Parameter(description = "me | household | profile", example = "household") @RequestParam String scope,
      @RequestParam(required = false) @Schema(nullable = true) String profileId,
      @Parameter(description = "Exact category match, e.g. \"Alimentação\".")
          @RequestParam(required = false) @Schema(nullable = true)
          String category,
      @Parameter(description = "paid | pending") @RequestParam(required = false) @Schema(nullable = true) String status,
      @Parameter(description = "expense | income") @RequestParam(required = false) @Schema(nullable = true)
          String entryType,
      @Parameter(description = "0-based page index, default 0") @RequestParam(required = false) Integer page,
      @Parameter(description = "1-200, default 50") @RequestParam(required = false) Integer pageSize) {
    AuthenticatedUser user = AuthenticatedUser.fromJwt(jwt);
    YearMonth parsedMonth = ToolRequestParsing.parseMonth(month);
    FinancialScope parsedScope = ToolRequestParsing.parseScope(scope, profileId);
    Optional<String> parsedCategory = category != null && !category.isBlank() ? Optional.of(category) : Optional.empty();
    Optional<ExpenseStatus> parsedStatus = ToolRequestParsing.parseStatus(status);
    Optional<EntryType> parsedEntryType = ToolRequestParsing.parseEntryType(entryType);
    int parsedPage = ToolRequestParsing.parsePage(page);
    int parsedPageSize = ToolRequestParsing.parsePageSize(pageSize);

    ExpensePage result =
        tool.execute(
            user, parsedMonth, parsedScope, parsedCategory, parsedStatus, parsedEntryType, parsedPage, parsedPageSize);
    return ExpensesResponse.from(result);
  }
}
