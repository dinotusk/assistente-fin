package com.aval.finance.simulations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import com.aval.finance.Money;
import java.time.Duration;
import java.time.YearMonth;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class SavingsSimulationCalculatorTest {

  private static final YearMonth AUGUST = YearMonth.of(2026, 8);

  @Nested
  class TimeToTargetTests {

    @Test
    void targetGreaterThanCurrentSavedComputesMonthsRequired() {
      // remaining = 1000 - 100 = 900; 900 / 300 = 3 exactly.
      TimeToTargetResult result = SavingsSimulationCalculator.timeToTarget(AUGUST, Money.of("1000"), Money.of("100"), Money.of("300"));
      assertThat(result.remainingAmount()).isEqualTo(Money.of("900"));
      assertThat(result.monthsRequired()).contains(3);
      assertThat(result.estimatedTargetMonth()).contains(YearMonth.of(2026, 11));
      assertThat(result.status()).isEqualTo(SimulationStatus.FEASIBLE);
    }

    @Test
    void currentSavedEqualsTargetIsAlreadyAchieved() {
      TimeToTargetResult result = SavingsSimulationCalculator.timeToTarget(AUGUST, Money.of("500"), Money.of("500"), Money.of("100"));
      assertThat(result.remainingAmount()).isEqualTo(Money.ZERO);
      assertThat(result.monthsRequired()).contains(0);
      assertThat(result.estimatedTargetMonth()).contains(AUGUST);
      assertThat(result.status()).isEqualTo(SimulationStatus.FEASIBLE);
    }

    @Test
    void currentSavedGreaterThanTargetIsAlsoAlreadyAchievedNeverNegativeRemaining() {
      TimeToTargetResult result = SavingsSimulationCalculator.timeToTarget(AUGUST, Money.of("500"), Money.of("800"), Money.of("100"));
      assertThat(result.remainingAmount()).isEqualTo(Money.ZERO);
      assertThat(result.monthsRequired()).contains(0);
    }

    @Test
    void zeroTargetIsAlreadyAchieved() {
      TimeToTargetResult result = SavingsSimulationCalculator.timeToTarget(AUGUST, Money.ZERO, Money.ZERO, Money.of("100"));
      assertThat(result.remainingAmount()).isEqualTo(Money.ZERO);
      assertThat(result.monthsRequired()).contains(0);
      assertThat(result.status()).isEqualTo(SimulationStatus.FEASIBLE);
    }

    @Test
    void zeroMonthlyContributionWithRemainingBalanceIsNeverFeasibleAndNeverAFabricatedMonthCount() {
      TimeToTargetResult result = SavingsSimulationCalculator.timeToTarget(AUGUST, Money.of("1000"), Money.of("100"), Money.ZERO);
      assertThat(result.monthsRequired()).isEmpty();
      assertThat(result.estimatedTargetMonth()).isEmpty();
      assertThat(result.status()).isEqualTo(SimulationStatus.NOT_FEASIBLE);
      assertThat(result.warnings()).extracting(SimulationWarning::code).containsExactly("ZERO_CONTRIBUTION");
    }

    @Test
    void inexactDivisionRoundsMonthsUpNeverDown() {
      // remaining = 1000; contribution = 300 -> 3.33... months -> must round up to 4 (3 months isn't enough).
      TimeToTargetResult result = SavingsSimulationCalculator.timeToTarget(AUGUST, Money.of("1000"), Money.ZERO, Money.of("300"));
      assertThat(result.monthsRequired()).contains(4);
      assertThat(result.estimatedTargetMonth()).contains(YearMonth.of(2026, 12));
    }

    @Test
    void centsAreHandledExactly() {
      TimeToTargetResult result = SavingsSimulationCalculator.timeToTarget(AUGUST, Money.of("100.01"), Money.of("0.01"), Money.of("50"));
      assertThat(result.remainingAmount()).isEqualTo(Money.of("100"));
      assertThat(result.monthsRequired()).contains(2);
    }

    @Test
    void everyResultCarriesTheNoInterestAssumption() {
      TimeToTargetResult result = SavingsSimulationCalculator.timeToTarget(AUGUST, Money.of("1000"), Money.ZERO, Money.of("100"));
      assertThat(result.assumptions()).extracting(SimulationAssumption::code).contains("NO_INTEREST_SAVINGS");
    }

    @Test
    void isDeterministicAcrossRepeatedCalls() {
      TimeToTargetResult a = SavingsSimulationCalculator.timeToTarget(AUGUST, Money.of("1000"), Money.of("100"), Money.of("300"));
      TimeToTargetResult b = SavingsSimulationCalculator.timeToTarget(AUGUST, Money.of("1000"), Money.of("100"), Money.of("300"));
      assertThat(a).isEqualTo(b);
    }

    @Test
    void targetAmountAtTheMaximumRepresentableLimitIsAccepted() {
      TimeToTargetResult result =
          SavingsSimulationCalculator.timeToTarget(AUGUST, SimulationLimits.MAX_MONEY_VALUE, Money.ZERO, Money.of("100"));
      assertThat(result.targetAmount()).isEqualTo(SimulationLimits.MAX_MONEY_VALUE);
    }

    @Test
    void targetAmountAboveTheMaximumRepresentableLimitIsRejected() {
      Money tooLarge = SimulationLimits.MAX_MONEY_VALUE.add(Money.of("0.01"));
      assertThatThrownBy(() -> SavingsSimulationCalculator.timeToTarget(AUGUST, tooLarge, Money.ZERO, Money.of("100")))
          .isInstanceOf(IllegalArgumentException.class);
    }
  }

  @Nested
  class FutureValueTests {

    @Test
    void twelveMonthsAccumulatesExactly() {
      FutureValueResult result = SavingsSimulationCalculator.futureValue(Money.of("1000"), Money.of("500"), 12);
      assertThat(result.projectedSaved()).isEqualTo(Money.of("7000"));
      assertThat(result.status()).isEqualTo(SimulationStatus.FEASIBLE);
    }

    @Test
    void zeroMonthsReturnsCurrentSavedUnchanged() {
      FutureValueResult result = SavingsSimulationCalculator.futureValue(Money.of("1000"), Money.of("500"), 0);
      assertThat(result.projectedSaved()).isEqualTo(Money.of("1000"));
    }

    @Test
    void centsAccumulateExactlyOverManyMonths() {
      FutureValueResult result = SavingsSimulationCalculator.futureValue(Money.ZERO, Money.of("33.33"), 3);
      assertThat(result.projectedSaved()).isEqualTo(Money.of("99.99"));
    }

    @Test
    void noInterestIsAssumedExplicitly() {
      FutureValueResult result = SavingsSimulationCalculator.futureValue(Money.ZERO, Money.of("100"), 5);
      assertThat(result.assumptions()).extracting(SimulationAssumption::code).contains("NO_INTEREST_SAVINGS");
    }

    @Test
    void twelveHundredMonthsIsAtTheMaximumBound() {
      FutureValueResult result = SavingsSimulationCalculator.futureValue(Money.ZERO, Money.of("1"), SimulationLimits.MAX_MONTHS);
      assertThat(result.projectedSaved()).isEqualTo(Money.of(String.valueOf(SimulationLimits.MAX_MONTHS)));
    }

    @Test
    void twelveHundredOneMonthsExceedsTheMaximumBound() {
      assertThatThrownBy(() -> SavingsSimulationCalculator.futureValue(Money.ZERO, Money.of("1"), SimulationLimits.MAX_MONTHS + 1))
          .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void extremelyLargeMonthsIsRejectedBeforeIteratingAtAll() {
      // If the bound weren't checked before the loop, Integer.MAX_VALUE months would iterate
      // ~2.1 billion times; assertTimeoutPreemptively proves the rejection is immediate.
      assertTimeoutPreemptively(
          Duration.ofSeconds(2),
          () ->
              assertThatThrownBy(() -> SavingsSimulationCalculator.futureValue(Money.ZERO, Money.of("1"), Integer.MAX_VALUE))
                  .isInstanceOf(IllegalArgumentException.class));
    }

    @Test
    void currentSavedAboveTheMaximumRepresentableLimitIsRejected() {
      Money tooLarge = SimulationLimits.MAX_MONEY_VALUE.add(Money.of("0.01"));
      assertThatThrownBy(() -> SavingsSimulationCalculator.futureValue(tooLarge, Money.of("1"), 1))
          .isInstanceOf(IllegalArgumentException.class);
    }
  }
}
