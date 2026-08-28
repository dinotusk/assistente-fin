package com.aval.assistant.tools;

import com.aval.finance.Money;
import com.aval.finance.simulations.PurchaseSimulationResult;
import com.aval.finance.simulations.SimulationLimits;
import com.aval.household.FinancialScope;
import com.aval.platform.auth.AuthenticatedUser;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import io.swagger.v3.oas.annotations.Operation;
import java.time.YearMonth;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** {@code simulate_purchase} as an HTTP tool endpoint — same read-only guarantee as the Assistant path (see {@link SimulatePurchaseAssistantTool}). */
@RestController
public class SimulatePurchaseController {

  private final SimulatePurchaseTool tool;

  public SimulatePurchaseController(SimulatePurchaseTool tool) {
    this.tool = tool;
  }

  public record Request(String month, String scope, String profileId, String purchaseAmount, Integer installments) {}

  @Operation(
      summary = "Financial Tool: simulate_purchase",
      description =
          "Read-only. Simulates a hypothetical purchase's impact on one month/scope's budget — "
              + "never writes an expense. Installments are always interest-free. Only the first "
              + "installment is counted against the simulated month.")
  @PostMapping("/api/v1/tools/simulate-purchase")
  public SimulatePurchaseResponse simulatePurchase(@AuthenticationPrincipal Jwt jwt, @RequestBody Request request) {
    AuthenticatedUser user = AuthenticatedUser.fromJwt(jwt);
    YearMonth month = ToolRequestParsing.parseMonth(require(request.month(), "month"));
    FinancialScope scope = ToolRequestParsing.parseScope(require(request.scope(), "scope"), request.profileId());
    Money purchaseAmount = parseMoney(require(request.purchaseAmount(), "purchaseAmount"));
    int installments = request.installments() != null ? request.installments() : 1;

    if (!purchaseAmount.isPositive()) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "purchaseAmount deve ser maior que zero.");
    }
    if (!SimulationLimits.isWithinInstallmentBounds(installments)) {
      throw new ApiException(
          ApiErrorType.VALIDATION_ERROR,
          "installments deve estar entre " + SimulationLimits.MIN_INSTALLMENTS + " e " + SimulationLimits.MAX_INSTALLMENTS + ".");
    }

    PurchaseSimulationResult result = tool.execute(user, month, scope, purchaseAmount, installments);
    return SimulatePurchaseResponse.from(result);
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
