package com.aval.finance.simulations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.aval.finance.Money;
import java.util.List;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class PurchaseSimulationCalculatorTest {

  @Nested
  class SplitIntoInstallmentsTests {

    @Test
    void oneInstallmentIsTheWholeAmount() {
      assertThat(PurchaseSimulationCalculator.splitIntoInstallments(Money.of("2400"), 1)).containsExactly(Money.of("2400"));
    }

    @Test
    void exactDivisionSplitsEvenly() {
      List<Money> schedule = PurchaseSimulationCalculator.splitIntoInstallments(Money.of("2400"), 6);
      assertThat(schedule).containsExactly(
          Money.of("400"), Money.of("400"), Money.of("400"), Money.of("400"), Money.of("400"), Money.of("400"));
    }

    @Test
    void inexactDivisionDistributesTheRemainderToTheFirstInstallmentsAndSumsExactly() {
      // 100.00 / 3 = 33.33... -> 33.34, 33.33, 33.33 (remainder cent goes to the first).
      List<Money> schedule = PurchaseSimulationCalculator.splitIntoInstallments(Money.of("100"), 3);
      assertThat(schedule).containsExactly(Money.of("33.34"), Money.of("33.33"), Money.of("33.33"));
      Money sum = schedule.stream().reduce(Money.ZERO, Money::add);
      assertThat(sum).isEqualTo(Money.of("100"));
    }

    @Test
    void largeInstallmentCountNeverLosesOrInventsACent() {
      List<Money> schedule = PurchaseSimulationCalculator.splitIntoInstallments(Money.of("1000.01"), 7);
      Money sum = schedule.stream().reduce(Money.ZERO, Money::add);
      assertThat(sum).isEqualTo(Money.of("1000.01"));
      assertThat(schedule).hasSize(7);
    }

    @Test
    void zeroOrNegativeInstallmentsIsRejected() {
      assertThatThrownBy(() -> PurchaseSimulationCalculator.splitIntoInstallments(Money.of("100"), 0))
          .isInstanceOf(IllegalArgumentException.class);
    }
  }

  @Nested
  class SimulateTests {

    @Test
    void purchaseSmallerThanFreeIsFeasible() {
      PurchaseSimulationResult result =
          PurchaseSimulationCalculator.simulate(Money.of("500"), 1, Money.of("5000"), Money.of("1000"), Money.of("4000"));
      assertThat(result.projectedFree()).isEqualTo(Money.of("3500"));
      assertThat(result.status()).isEqualTo(SimulationStatus.FEASIBLE);
      assertThat(result.warnings()).isEmpty();
    }

    @Test
    void purchaseExactlyEqualToFreeIsWarning() {
      PurchaseSimulationResult result =
          PurchaseSimulationCalculator.simulate(Money.of("4000"), 1, Money.of("5000"), Money.of("1000"), Money.of("4000"));
      assertThat(result.projectedFree()).isEqualTo(Money.ZERO);
      assertThat(result.status()).isEqualTo(SimulationStatus.WARNING);
      assertThat(result.warnings()).extracting(SimulationWarning::code).containsExactly("TIGHT_BUDGET");
    }

    @Test
    void purchaseGreaterThanFreeIsNotFeasible() {
      PurchaseSimulationResult result =
          PurchaseSimulationCalculator.simulate(Money.of("4500"), 1, Money.of("5000"), Money.of("1000"), Money.of("4000"));
      assertThat(result.projectedFree()).isEqualTo(Money.of("-500"));
      assertThat(result.status()).isEqualTo(SimulationStatus.NOT_FEASIBLE);
      assertThat(result.warnings()).extracting(SimulationWarning::code).containsExactly("BUDGET_EXCEEDED");
    }

    @Test
    void amountWithCentsIsHandledExactly() {
      PurchaseSimulationResult result =
          PurchaseSimulationCalculator.simulate(Money.of("199.99"), 1, Money.of("5000"), Money.of("1000"), Money.of("4000"));
      assertThat(result.projectedTotal()).isEqualTo(Money.of("1199.99"));
      assertThat(result.projectedFree()).isEqualTo(Money.of("3800.01"));
    }

    @Test
    void multipleInstallmentsOnlyImpactTheSimulatedMonthWithTheFirstInstallment() {
      PurchaseSimulationResult result =
          PurchaseSimulationCalculator.simulate(Money.of("2400"), 6, Money.of("5000"), Money.of("1000"), Money.of("4000"));
      assertThat(result.installmentSchedule()).hasSize(6);
      assertThat(result.projectedTotal()).isEqualTo(Money.of("1400")); // 1000 + 400 (first installment only)
      assertThat(result.projectedFree()).isEqualTo(Money.of("3600"));
      Money sum = result.installmentSchedule().stream().reduce(Money.ZERO, Money::add);
      assertThat(sum).isEqualTo(Money.of("2400"));
    }

    @Test
    void assumptionsAlwaysIncludeHypotheticalAndNoInterestAndSingleMonthImpactOnlyWhenInstallmentsGreaterThanOne() {
      PurchaseSimulationResult single =
          PurchaseSimulationCalculator.simulate(Money.of("100"), 1, Money.of("5000"), Money.of("0"), Money.of("5000"));
      assertThat(single.assumptions()).extracting(SimulationAssumption::code)
          .containsExactly("HYPOTHETICAL_SCENARIO", "NO_INTEREST_INSTALLMENTS");

      PurchaseSimulationResult multi =
          PurchaseSimulationCalculator.simulate(Money.of("100"), 4, Money.of("5000"), Money.of("0"), Money.of("5000"));
      assertThat(multi.assumptions()).extracting(SimulationAssumption::code)
          .containsExactly("HYPOTHETICAL_SCENARIO", "NO_INTEREST_INSTALLMENTS", "SINGLE_MONTH_IMPACT");
    }

    @Test
    void zeroAmountIsRejected() {
      assertThatThrownBy(() -> PurchaseSimulationCalculator.simulate(Money.ZERO, 1, Money.of("5000"), Money.ZERO, Money.of("5000")))
          .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void negativeAmountIsRejected() {
      assertThatThrownBy(() -> PurchaseSimulationCalculator.simulate(Money.of("-10"), 1, Money.of("5000"), Money.ZERO, Money.of("5000")))
          .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void zeroInstallmentsIsRejected() {
      assertThatThrownBy(() -> PurchaseSimulationCalculator.simulate(Money.of("100"), 0, Money.of("5000"), Money.ZERO, Money.of("5000")))
          .isInstanceOf(IllegalArgumentException.class);
    }
  }
}
