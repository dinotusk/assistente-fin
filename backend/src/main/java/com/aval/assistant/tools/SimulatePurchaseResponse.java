package com.aval.assistant.tools;

import com.aval.finance.Money;
import com.aval.finance.simulations.PurchaseSimulationResult;
import com.aval.finance.simulations.SimulationAssumption;
import com.aval.finance.simulations.SimulationWarning;
import java.util.List;

/**
 * The wire shape for {@code simulate_purchase}. Every money field carries an explicit {@code
 * provenance}: {@code purchaseAmount} is INPUT (the caller's own hypothetical value, never a
 * stored or derived fact); {@code currentBudget}/{@code currentTotal}/{@code currentFree} are
 * CALCULATED — the exact same real, tenancy-checked numbers {@code get_financial_summary}
 * already returns for this month/scope, carried through unchanged as the hypothesis' starting
 * point; {@code projectedTotal}/{@code projectedFree}/{@code installmentSchedule} are CALCULATED
 * by {@code PurchaseSimulationCalculator}. {@code isHypothetical: true} is always present so a
 * consumer never has to infer it from context.
 */
public record SimulatePurchaseResponse(
    boolean isHypothetical,
    MoneyValue purchaseAmount,
    int installments,
    List<MoneyValue> installmentSchedule,
    MoneyValue currentBudget,
    MoneyValue currentTotal,
    MoneyValue currentFree,
    MoneyValue projectedTotal,
    MoneyValue projectedFree,
    String status,
    List<AssumptionValue> assumptions,
    List<WarningValue> warnings) {

  public record MoneyValue(String value, String provenance) {}

  public record AssumptionValue(String code, String description) {}

  public record WarningValue(String code, String message) {}

  public static SimulatePurchaseResponse from(PurchaseSimulationResult result) {
    return new SimulatePurchaseResponse(
        true,
        input(result.purchaseAmount()),
        result.installments(),
        result.installmentSchedule().stream().map(SimulatePurchaseResponse::calculated).toList(),
        calculated(result.currentBudget()),
        calculated(result.currentTotal()),
        calculated(result.currentFree()),
        calculated(result.projectedTotal()),
        calculated(result.projectedFree()),
        result.status().name(),
        result.assumptions().stream().map(a -> new AssumptionValue(a.code(), a.description())).toList(),
        result.warnings().stream().map(w -> new WarningValue(w.code(), w.message())).toList());
  }

  private static MoneyValue input(Money money) {
    return new MoneyValue(money.value().toPlainString(), "INPUT");
  }

  private static MoneyValue calculated(Money money) {
    return new MoneyValue(money.value().toPlainString(), "CALCULATED");
  }
}
