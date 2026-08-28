package com.aval.assistant.tools;

import com.aval.finance.Money;
import com.aval.finance.simulations.FutureValueResult;
import com.aval.finance.simulations.SimulationLimits;
import com.aval.finance.simulations.TimeToTargetResult;
import com.aval.platform.auth.AuthenticatedUser;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import io.swagger.v3.oas.annotations.Operation;
import java.time.YearMonth;
import java.util.Optional;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** {@code simulate_savings} as an HTTP tool endpoint — same read-only guarantee as the Assistant path (see {@link SimulateSavingsAssistantTool}). */
@RestController
public class SimulateSavingsController {

  private final SimulateSavingsTool tool;

  public SimulateSavingsController(SimulateSavingsTool tool) {
    this.tool = tool;
  }

  public record Request(
      String mode, String month, String goalId, String targetAmount, String currentSaved, String monthlyContribution, Integer months) {}

  @Operation(
      summary = "Financial Tool: simulate_savings",
      description =
          "Read-only. mode=TIME_TO_TARGET computes months required to reach targetAmount; "
              + "mode=FUTURE_VALUE projects savings after N months. No interest/yield modeled. "
              + "goalId sources targetAmount/currentSaved from an existing goal when provided; "
              + "otherwise those must be supplied explicitly.")
  @PostMapping("/api/v1/tools/simulate-savings")
  public SimulateSavingsResponse simulateSavings(@AuthenticationPrincipal Jwt jwt, @RequestBody Request request) {
    AuthenticatedUser user = AuthenticatedUser.fromJwt(jwt);
    String mode = require(request.mode(), "mode");
    YearMonth month = ToolRequestParsing.parseMonth(require(request.month(), "month"));
    Optional<UUID> goalId = parseOptionalUuid(request.goalId());
    Money monthlyContribution = parseMoney(require(request.monthlyContribution(), "monthlyContribution"));
    if (monthlyContribution.isNegative()) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "monthlyContribution nao pode ser negativo.");
    }

    return switch (mode) {
      case "TIME_TO_TARGET" -> {
        Money targetAmount = requireExplicitOrGoal(request.targetAmount(), goalId);
        Money currentSaved = requireExplicitOrGoal(request.currentSaved(), goalId);
        if (targetAmount.isNegative()) throw new ApiException(ApiErrorType.VALIDATION_ERROR, "targetAmount nao pode ser negativo.");
        if (currentSaved.isNegative()) throw new ApiException(ApiErrorType.VALIDATION_ERROR, "currentSaved nao pode ser negativo.");
        TimeToTargetResult result = tool.timeToTarget(user, month, goalId, targetAmount, currentSaved, monthlyContribution);
        yield SimulateSavingsResponse.fromTimeToTarget(result);
      }
      case "FUTURE_VALUE" -> {
        Money currentSaved = requireExplicitOrGoal(request.currentSaved(), goalId);
        if (currentSaved.isNegative()) throw new ApiException(ApiErrorType.VALIDATION_ERROR, "currentSaved nao pode ser negativo.");
        if (request.months() == null || !SimulationLimits.isWithinMonthsBounds(request.months())) {
          throw new ApiException(
              ApiErrorType.VALIDATION_ERROR,
              "months e obrigatorio, entre " + SimulationLimits.MIN_MONTHS + " e " + SimulationLimits.MAX_MONTHS + ".");
        }
        FutureValueResult result = tool.futureValue(user, month, goalId, currentSaved, monthlyContribution, request.months());
        yield SimulateSavingsResponse.fromFutureValue(result);
      }
      default -> throw new ApiException(ApiErrorType.VALIDATION_ERROR, "mode deve ser um de: TIME_TO_TARGET, FUTURE_VALUE.");
    };
  }

  private static Money requireExplicitOrGoal(String value, Optional<UUID> goalId) {
    if (goalId.isPresent()) {
      return value == null || value.isBlank() ? Money.ZERO : parseMoney(value);
    }
    return parseMoney(require(value, "targetAmount/currentSaved"));
  }

  private static Optional<UUID> parseOptionalUuid(String value) {
    if (value == null || value.isBlank()) return Optional.empty();
    try {
      return Optional.of(UUID.fromString(value));
    } catch (IllegalArgumentException e) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "goalId deve ser um UUID valido.");
    }
  }

  private static String require(String value, String field) {
    if (value == null || value.isBlank()) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, field + " e obrigatorio.");
    }
    return value;
  }

  private static Money parseMoney(String value) {
    try {
      return SimulationLimits.parseMoneyOrThrow(value);
    } catch (IllegalArgumentException e) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "Valor monetario invalido.");
    }
  }
}
