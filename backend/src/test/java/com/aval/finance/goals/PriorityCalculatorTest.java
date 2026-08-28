package com.aval.finance.goals;

import static org.assertj.core.api.Assertions.assertThat;

import com.aval.finance.Money;
import com.aval.finance.Percent;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PriorityCalculatorTest {

  private static Priority priority(String target, String saved) {
    return new Priority(
        UUID.randomUUID(),
        UUID.randomUUID(),
        UUID.randomUUID(),
        UUID.randomUUID(),
        "Meta",
        Money.of(target),
        Money.of(saved),
        2,
        PriorityStatus.PENDING);
  }

  @Test
  void targetGreaterThanSavedLeavesARemainingBalanceAndPartialProgress() {
    GoalView view = PriorityCalculator.toView(priority("1000", "400"));

    assertThat(view.remaining()).isEqualTo(Money.of("600"));
    assertThat(view.progress()).isEqualTo(new Percent.Value(new java.math.BigDecimal("40.00")));
  }

  @Test
  void savedEqualsTargetIsZeroRemainingAndFullProgress() {
    GoalView view = PriorityCalculator.toView(priority("500", "500"));

    assertThat(view.remaining()).isEqualTo(Money.ZERO);
    assertThat(view.progress()).isEqualTo(new Percent.Value(new java.math.BigDecimal("100.00")));
  }

  @Test
  void savedGreaterThanTargetNeverProducesNegativeRemainingOrOverHundredProgress() {
    GoalView view = PriorityCalculator.toView(priority("300", "500"));

    assertThat(view.remaining()).isEqualTo(Money.ZERO);
    assertThat(view.progress()).isEqualTo(new Percent.Value(new java.math.BigDecimal("100.00")));
  }

  @Test
  void zeroTargetIsZeroRemainingAndExplicitZeroProgress() {
    GoalView view = PriorityCalculator.toView(priority("0", "0"));

    assertThat(view.remaining()).isEqualTo(Money.ZERO);
    assertThat(view.progress()).isEqualTo(new Percent.Value(new java.math.BigDecimal("0.00")));
  }
}
