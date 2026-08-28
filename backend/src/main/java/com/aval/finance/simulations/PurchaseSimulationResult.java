package com.aval.finance.simulations;

import com.aval.finance.Money;
import java.util.List;

/**
 * Result of {@code simulate_purchase} — see {@link PurchaseSimulationCalculator} for how every
 * field is derived. {@code currentBudget}/{@code currentTotal}/{@code currentFree} are the real,
 * unmodified numbers {@link com.aval.finance.summary.FinancialCalculator} already computed for
 * the real month/scope; {@code projectedTotal}/{@code projectedFree} are the only hypothetical
 * values here, and only ever exist in this in-memory result — never written anywhere.
 */
public record PurchaseSimulationResult(
    Money purchaseAmount,
    int installments,
    List<Money> installmentSchedule,
    Money currentBudget,
    Money currentTotal,
    Money currentFree,
    Money projectedTotal,
    Money projectedFree,
    SimulationStatus status,
    List<SimulationAssumption> assumptions,
    List<SimulationWarning> warnings) {}
