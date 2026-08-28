package com.aval.assistant.tools;

import com.aval.finance.goals.GoalView;
import com.aval.household.FinancialScope;
import com.aval.platform.auth.AuthenticatedUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.YearMonth;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** {@code get_goals} as an HTTP tool endpoint — see {@code GetGoalsUseCase}/{@code PriorityCalculator}. */
@RestController
public class GetGoalsController {

  private final GetGoalsTool tool;

  public GetGoalsController(GetGoalsTool tool) {
    this.tool = tool;
  }

  @Operation(
      summary = "Financial Tool: get_goals",
      description =
          "Read-only. \"Goal\" maps 1:1 onto the existing priorities domain — see "
              + "docs/architecture/financial-tools.md. `progress` is 0.00 (never NOT_APPLICABLE) "
              + "when targetAmount is zero, matching the frontend's existing AI-context precedent.")
  @GetMapping("/api/v1/tools/goals")
  public GoalsResponse goals(
      @AuthenticationPrincipal Jwt jwt,
      @Parameter(description = "YYYY-MM", example = "2026-08") @RequestParam String month,
      @Parameter(description = "me | household | profile", example = "household") @RequestParam String scope,
      @RequestParam(required = false) @Schema(nullable = true) String profileId) {
    AuthenticatedUser user = AuthenticatedUser.fromJwt(jwt);
    YearMonth parsedMonth = ToolRequestParsing.parseMonth(month);
    FinancialScope parsedScope = ToolRequestParsing.parseScope(scope, profileId);
    List<GoalView> goals = tool.execute(user, parsedMonth, parsedScope);
    return GoalsResponse.from(goals);
  }
}
