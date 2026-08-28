package com.aval.finance.simulations;

import static org.assertj.core.api.Assertions.assertThat;

import com.aval.finance.Money;
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
  }
}
