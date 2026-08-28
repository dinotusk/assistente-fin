package com.aval.finance.simulations;

import com.aval.finance.Money;
import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

/**
 * Pure {@code simulate_savings} math for both modes (see {@link SavingsSimulationMode}) — no
 * Spring, no I/O, no interest/yield modeled (a deliberate P5 scope limit, not an oversight —
 * every result carries {@link SimulationAssumption#noInterestOnSavings()}).
 *
 * <p>Preconditions (enforced by the caller — {@code SimulateSavingsUseCase}/{@code
 * AssistantToolArguments} — before either method runs, exactly like {@link
 * PurchaseSimulationCalculator}): {@code targetAmount}/{@code currentSaved}/{@code
 * monthlyContribution} are never negative, {@code months >= 0}.
 */
public final class SavingsSimulationCalculator {

  private SavingsSimulationCalculator() {}

  /**
   * {@code remainingAmount = max(0, target - currentSaved)} — the exact same clamp-at-zero
   * formula {@code PriorityCalculator} already uses for a goal's remaining amount, reused here
   * rather than re-derived, so the two "how much is left" concepts in this codebase can never
   * silently drift apart.
   *
   * <p>Already-met ({@code remainingAmount == 0}) is {@code monthsRequired = 0}, the input month
   * itself. Unreachable ({@code monthlyContribution == 0} and {@code remainingAmount > 0}) is
   * {@code monthsRequired = empty} + {@link SimulationWarning#zeroContribution()} +
   * {@code NOT_FEASIBLE} — never a fabricated month count. Otherwise, {@code monthsRequired =
   * ceil(remainingAmount / monthlyContribution)}: rounded up because saving for a fractional
   * month still requires that whole month to pass before the target is reached.
   */
  public static TimeToTargetResult timeToTarget(
      YearMonth baseMonth, Money targetAmount, Money currentSaved, Money monthlyContribution) {
    Money remaining = Money.max(Money.ZERO, targetAmount.subtract(currentSaved));

    List<SimulationAssumption> assumptions =
        List.of(SimulationAssumption.hypotheticalScenario(), SimulationAssumption.noInterestOnSavings());

    if (remaining.isZero()) {
      return new TimeToTargetResult(
          targetAmount, currentSaved, monthlyContribution, remaining,
          Optional.of(0), Optional.of(baseMonth), SimulationStatus.FEASIBLE, assumptions, List.of());
    }

    if (monthlyContribution.isZero()) {
      return new TimeToTargetResult(
          targetAmount, currentSaved, monthlyContribution, remaining,
          Optional.empty(), Optional.empty(), SimulationStatus.NOT_FEASIBLE, assumptions,
          List.of(SimulationWarning.zeroContribution()));
    }

    BigDecimal ratio = remaining.value().divide(monthlyContribution.value(), MathContext.DECIMAL64);
    int monthsRequired = ratio.setScale(0, RoundingMode.CEILING).intValueExact();
    YearMonth estimatedTargetMonth = baseMonth.plusMonths(monthsRequired);

    return new TimeToTargetResult(
        targetAmount, currentSaved, monthlyContribution, remaining,
        Optional.of(monthsRequired), Optional.of(estimatedTargetMonth), SimulationStatus.FEASIBLE, assumptions, List.of());
  }

  /** {@code projectedSaved = currentSaved + monthlyContribution * months} — accumulated via repeated {@link Money#add}, never a new multiply operation on {@link Money} (deliberately not added — see Money's own javadoc). */
  public static FutureValueResult futureValue(Money currentSaved, Money monthlyContribution, int months) {
    Money projected = currentSaved;
    for (int i = 0; i < months; i++) {
      projected = projected.add(monthlyContribution);
    }
    List<SimulationAssumption> assumptions =
        List.of(SimulationAssumption.hypotheticalScenario(), SimulationAssumption.noInterestOnSavings());
    return new FutureValueResult(currentSaved, monthlyContribution, months, projected, SimulationStatus.FEASIBLE, assumptions, List.of());
  }
}
