package com.aval.finance.simulations;

import com.aval.finance.Money;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * Pure {@code simulate_purchase} math — no Spring, no I/O, no wall-clock/{@code LocalDate.now()}
 * dependency (a feasibility rule that reads "today" would make results non-reproducible; see
 * docs/architecture/simulation-engine.md "Feasibility rule" for why the V0 PWA's existing
 * {@code getPurchaseResult}/{@code weeklyAllowance} rule was deliberately NOT reused here).
 * Every {@code Money} input/output is exact — installments never lose or invent a cent (see
 * {@link #splitIntoInstallments}).
 */
public final class PurchaseSimulationCalculator {

  private PurchaseSimulationCalculator() {}

  /**
   * Splits {@code total} into {@code installments} parts whose sum is exactly {@code total} —
   * never more, never less. Policy: divide in integer cents ({@code total} is always exact-scale-2
   * per {@link Money}'s own invariant, so {@code unscaledValue()} is exactly the cent count),
   * every installment gets {@code totalCents / installments} cents, and the remainder (always
   * {@code < installments} cents) is distributed as one extra cent each to the first {@code
   * remainder} installments — a simple, deterministic, auditable convention, not a "fair
   * rounding" heuristic. E.g. 100.00 split 3 ways -> [33.34, 33.33, 33.33].
   */
  public static List<Money> splitIntoInstallments(Money total, int installments) {
    if (installments < 1) {
      throw new IllegalArgumentException("installments must be >= 1");
    }
    long totalCents = total.value().unscaledValue().longValueExact();
    long baseCents = totalCents / installments;
    long remainderCents = totalCents % installments;

    List<Money> schedule = new ArrayList<>(installments);
    for (int i = 0; i < installments; i++) {
      long cents = baseCents + (i < remainderCents ? 1 : 0);
      schedule.add(Money.of(BigDecimal.valueOf(cents, 2)));
    }
    return schedule;
  }

  /**
   * {@code projectedTotal}/{@code projectedFree} account for only the <b>first</b> installment —
   * a multi-installment purchase's later parcels fall on future months this simulation doesn't
   * model (see {@link SimulationAssumption#singleMonthImpact()}). Feasibility (see
   * docs/architecture/simulation-engine.md): {@code projectedFree > 0} -> FEASIBLE, {@code == 0}
   * -> WARNING, {@code < 0} -> NOT_FEASIBLE — no existing canonical rule in this codebase was
   * compatible (see this class's own javadoc), so these are the only objective facts used.
   */
  public static PurchaseSimulationResult simulate(
      Money purchaseAmount, int installments, Money currentBudget, Money currentTotal, Money currentFree) {
    if (!purchaseAmount.isPositive()) {
      throw new IllegalArgumentException("purchaseAmount must be > 0");
    }
    if (installments < 1) {
      throw new IllegalArgumentException("installments must be >= 1");
    }

    List<Money> schedule = splitIntoInstallments(purchaseAmount, installments);
    Money firstInstallment = schedule.get(0);
    Money projectedTotal = currentTotal.add(firstInstallment);
    Money projectedFree = currentFree.subtract(firstInstallment);

    SimulationStatus status;
    List<SimulationWarning> warnings = new ArrayList<>();
    if (projectedFree.isNegative()) {
      status = SimulationStatus.NOT_FEASIBLE;
      warnings.add(SimulationWarning.budgetExceeded(projectedFree.value().abs().toPlainString()));
    } else if (projectedFree.isZero()) {
      status = SimulationStatus.WARNING;
      warnings.add(SimulationWarning.tightBudget());
    } else {
      status = SimulationStatus.FEASIBLE;
    }

    List<SimulationAssumption> assumptions = new ArrayList<>();
    assumptions.add(SimulationAssumption.hypotheticalScenario());
    assumptions.add(SimulationAssumption.noInterestOnInstallments());
    if (installments > 1) {
      assumptions.add(SimulationAssumption.singleMonthImpact());
    }

    return new PurchaseSimulationResult(
        purchaseAmount,
        installments,
        schedule,
        currentBudget,
        currentTotal,
        currentFree,
        projectedTotal,
        projectedFree,
        status,
        List.copyOf(assumptions),
        List.copyOf(warnings));
  }
}
