package com.aval.assistant.tools;

import com.aval.finance.Money;
import com.aval.finance.simulations.FutureValueResult;
import com.aval.finance.simulations.SimulationAssumption;
import com.aval.finance.simulations.SimulationWarning;
import com.aval.finance.simulations.TimeToTargetResult;
import java.util.List;

/**
 * The wire shape for {@code simulate_savings} — one shape for both modes (see {@code
 * SavingsSimulationMode}), discriminated by {@code mode}; fields that don't apply to a mode are
 * {@code null} rather than a fabricated zero. {@code targetAmount}/{@code currentSaved}/{@code
 * monthlyContribution} are INPUT (the caller's own hypothetical values, or a real goal's stored
 * values when {@code goalId} was used — either way, never derived by this endpoint); every other
 * money field is CALCULATED.
 */
public record SimulateSavingsResponse(
    boolean isHypothetical,
    String mode,
    SimulatePurchaseResponse.MoneyValue targetAmount,
    SimulatePurchaseResponse.MoneyValue currentSaved,
    SimulatePurchaseResponse.MoneyValue monthlyContribution,
    SimulatePurchaseResponse.MoneyValue remainingAmount,
    Integer monthsRequired,
    String estimatedTargetMonth,
    Integer months,
    SimulatePurchaseResponse.MoneyValue projectedSaved,
    String status,
    List<SimulatePurchaseResponse.AssumptionValue> assumptions,
    List<SimulatePurchaseResponse.WarningValue> warnings) {

  public static SimulateSavingsResponse fromTimeToTarget(TimeToTargetResult result) {
    return new SimulateSavingsResponse(
        true,
        "TIME_TO_TARGET",
        input(result.targetAmount()),
        input(result.currentSaved()),
        input(result.monthlyContribution()),
        calculated(result.remainingAmount()),
        result.monthsRequired().orElse(null),
        result.estimatedTargetMonth().map(Object::toString).orElse(null),
        null,
        null,
        result.status().name(),
        assumptionsOf(result.assumptions()),
        warningsOf(result.warnings()));
  }

  public static SimulateSavingsResponse fromFutureValue(FutureValueResult result) {
    return new SimulateSavingsResponse(
        true,
        "FUTURE_VALUE",
        null,
        input(result.currentSaved()),
        input(result.monthlyContribution()),
        null,
        null,
        null,
        result.months(),
        calculated(result.projectedSaved()),
        result.status().name(),
        assumptionsOf(result.assumptions()),
        warningsOf(result.warnings()));
  }

  private static List<SimulatePurchaseResponse.AssumptionValue> assumptionsOf(List<SimulationAssumption> assumptions) {
    return assumptions.stream().map(a -> new SimulatePurchaseResponse.AssumptionValue(a.code(), a.description())).toList();
  }

  private static List<SimulatePurchaseResponse.WarningValue> warningsOf(List<SimulationWarning> warnings) {
    return warnings.stream().map(w -> new SimulatePurchaseResponse.WarningValue(w.code(), w.message())).toList();
  }

  private static SimulatePurchaseResponse.MoneyValue input(Money money) {
    return new SimulatePurchaseResponse.MoneyValue(money.value().toPlainString(), "INPUT");
  }

  private static SimulatePurchaseResponse.MoneyValue calculated(Money money) {
    return new SimulatePurchaseResponse.MoneyValue(money.value().toPlainString(), "CALCULATED");
  }
}
