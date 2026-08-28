package com.aval.assistant.tools;

import com.aval.finance.summary.MonthComparisonResult;
import com.aval.household.FinancialScope;
import com.aval.platform.auth.AuthenticatedUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.YearMonth;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** {@code compare_months} as an HTTP tool endpoint — see {@code CompareMonthsUseCase}. */
@RestController
public class CompareMonthsController {

  private final CompareMonthsTool tool;

  public CompareMonthsController(CompareMonthsTool tool) {
    this.tool = tool;
  }

  @Operation(
      summary = "Financial Tool: compare_months",
      description =
          "Read-only comparison of two months for one scope. `deltaPercent` fields use "
              + "{status: OK|NOT_APPLICABLE, value}: NOT_APPLICABLE when the baseline month is "
              + "zero (a percent change from zero is undefined — never returned as 0% or 100%).")
  @GetMapping("/api/v1/tools/compare-months")
  public CompareMonthsResponse compareMonths(
      @AuthenticationPrincipal Jwt jwt,
      @Parameter(description = "YYYY-MM, the baseline month", example = "2026-07") @RequestParam String monthA,
      @Parameter(description = "YYYY-MM, the comparison month", example = "2026-08") @RequestParam String monthB,
      @Parameter(description = "me | household | profile", example = "household") @RequestParam String scope,
      @RequestParam(required = false) @Schema(nullable = true) String profileId) {
    AuthenticatedUser user = AuthenticatedUser.fromJwt(jwt);
    YearMonth parsedMonthA = ToolRequestParsing.parseMonth(monthA);
    YearMonth parsedMonthB = ToolRequestParsing.parseMonth(monthB);
    FinancialScope parsedScope = ToolRequestParsing.parseScope(scope, profileId);
    MonthComparisonResult result = tool.execute(user, parsedMonthA, parsedMonthB, parsedScope);
    return CompareMonthsResponse.from(result);
  }
}
