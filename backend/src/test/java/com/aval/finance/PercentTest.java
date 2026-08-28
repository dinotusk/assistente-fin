package com.aval.finance;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class PercentTest {

  @Nested
  class OfDeltaTests {

    @Test
    void increaseFromNonZeroBaselineComputesPositivePercent() {
      // 4000 -> 5000: +1000, +25% — the exact example from the P3 spec.
      Percent result = Percent.ofDelta(BigDecimal.valueOf(1000), BigDecimal.valueOf(4000));
      assertThat(result).isEqualTo(new Percent.Value(new BigDecimal("25.00")));
    }

    @Test
    void decreaseFromNonZeroBaselineComputesNegativePercent() {
      Percent result = Percent.ofDelta(BigDecimal.valueOf(-1000), BigDecimal.valueOf(4000));
      assertThat(result).isEqualTo(new Percent.Value(new BigDecimal("-25.00")));
    }

    @Test
    void equalMonthsAreZeroPercent() {
      Percent result = Percent.ofDelta(BigDecimal.ZERO, BigDecimal.valueOf(4000));
      assertThat(result).isEqualTo(new Percent.Value(new BigDecimal("0.00")));
    }

    @Test
    void zeroBaselineIsNotApplicableNeverZeroOrHundred() {
      // 0 -> 1000: never fabricated as 0% or 100% — see the P3 spec's own worked example.
      Percent result = Percent.ofDelta(BigDecimal.valueOf(1000), BigDecimal.ZERO);
      assertThat(result).isEqualTo(new Percent.NotApplicable());
    }

    @Test
    void bothMonthsZeroIsNotApplicable() {
      Percent result = Percent.ofDelta(BigDecimal.ZERO, BigDecimal.ZERO);
      assertThat(result).isEqualTo(new Percent.NotApplicable());
    }
  }

  @Nested
  class OfProgressRatioTests {

    @Test
    void targetGreaterThanSavedIsPartialProgress() {
      Percent result = Percent.ofProgressRatio(new BigDecimal("400.00"), new BigDecimal("1000.00"));
      assertThat(result).isEqualTo(new Percent.Value(new BigDecimal("40.00")));
    }

    @Test
    void savedEqualsTargetIsFullProgress() {
      Percent result = Percent.ofProgressRatio(new BigDecimal("500.00"), new BigDecimal("500.00"));
      assertThat(result).isEqualTo(new Percent.Value(new BigDecimal("100.00")));
    }

    @Test
    void savedGreaterThanTargetIsCappedAtOneHundredNeverOverHundred() {
      Percent result = Percent.ofProgressRatio(new BigDecimal("500.00"), new BigDecimal("300.00"));
      assertThat(result).isEqualTo(new Percent.Value(new BigDecimal("100.00")));
    }

    @Test
    void zeroTargetIsExplicitlyZeroProgressNeverNotApplicable() {
      // Parity with ai.ts's GOALS branch: `valorAlvo > 0 ? saved/valorAlvo : 0`.
      Percent result = Percent.ofProgressRatio(BigDecimal.ZERO, BigDecimal.ZERO);
      assertThat(result).isEqualTo(new Percent.Value(new BigDecimal("0.00")));
    }
  }
}
