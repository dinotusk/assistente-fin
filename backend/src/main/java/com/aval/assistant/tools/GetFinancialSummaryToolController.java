package com.aval.assistant.tools;

import com.aval.finance.summary.FinancialSummary;
import com.aval.finance.summary.FinancialSummaryResponse;
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

/**
 * {@code get_financial_summary} as an HTTP tool endpoint — identical contract to {@code
 * GET /api/v1/financial-summary} (P2, untouched, still serving that exact path), exposed again
 * under {@code /api/v1/tools/*} so the future Assistant's tool layer has one consistent namespace
 * to call, and so this tool can be exercised over HTTP without any LLM involved this round.
 */
@RestController
public class GetFinancialSummaryToolController {

  private final GetFinancialSummaryTool tool;

  public GetFinancialSummaryToolController(GetFinancialSummaryTool tool) {
    this.tool = tool;
  }

  @Operation(
      summary = "Financial Tool: get_financial_summary",
      description =
          "Read-only. Identical semantics to GET /api/v1/financial-summary. `scope=household` "
              + "sums the whole household; `scope=me` is the household's first-position profile; "
              + "`scope=profile` requires `profileId` (a UUID, never a display name).")
  @GetMapping("/api/v1/tools/financial-summary")
  public FinancialSummaryResponse financialSummary(
      @AuthenticationPrincipal Jwt jwt,
      @Parameter(description = "YYYY-MM", example = "2026-08") @RequestParam String month,
      @Parameter(description = "me | household | profile", example = "household") @RequestParam String scope,
      @Parameter(description = "Required when scope=profile.") @RequestParam(required = false) @Schema(nullable = true)
          String profileId) {
    AuthenticatedUser user = AuthenticatedUser.fromJwt(jwt);
    YearMonth parsedMonth = ToolRequestParsing.parseMonth(month);
    FinancialScope parsedScope = ToolRequestParsing.parseScope(scope, profileId);
    FinancialSummary summary = tool.execute(user, parsedMonth, parsedScope);
    return FinancialSummaryResponse.from(summary);
  }
}
