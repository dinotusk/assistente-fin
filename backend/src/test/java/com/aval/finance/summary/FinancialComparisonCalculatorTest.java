package com.aval.finance.summary;

import static org.assertj.core.api.Assertions.assertThat;

import com.aval.finance.Money;
import com.aval.finance.Percent;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class FinancialComparisonCalculatorTest {

  @Nested
  class DeltaTests {

    @Test
    void increaseIsPositiveDelta() {
      assertThat(FinancialComparisonCalculator.delta(Money.of("4000"), Money.of("5000"))).isEqualTo(Money.of("1000"));
    }

    @Test
    void decreaseIsNegativeDelta() {
      assertThat(FinancialComparisonCalculator.delta(Money.of("5000"), Money.of("4000"))).isEqualTo(Money.of("-1000"));
    }

    @Test
    void equalMonthsAreZeroDelta() {
      assertThat(FinancialComparisonCalculator.delta(Money.of("4000"), Money.of("4000"))).isEqualTo(Money.ZERO);
    }
  }

  @Nested
  class CompareCategoriesTests {

    @Test
    void categoryPresentInBothMonthsGetsARealDelta() {
      List<CategoryComparison> result =
          FinancialComparisonCalculator.compareCategories(
              List.of(new CategoryTotal("Casa", Money.of("400"))),
              List.of(new CategoryTotal("Casa", Money.of("700"))));

      assertThat(result).hasSize(1);
      CategoryComparison casa = result.get(0);
      assertThat(casa.category()).isEqualTo("Casa");
      assertThat(casa.totalA()).isEqualTo(Money.of("400"));
      assertThat(casa.totalB()).isEqualTo(Money.of("700"));
      assertThat(casa.delta()).isEqualTo(Money.of("300"));
      assertThat(casa.deltaPercent()).isEqualTo(new Percent.Value(new BigDecimal("75.00")));
    }

    @Test
    void categoryOnlyInMonthATreatsMonthBAsZeroNeverAsMissing() {
      List<CategoryComparison> result =
          FinancialComparisonCalculator.compareCategories(
              List.of(new CategoryTotal("Lazer", Money.of("100"))), List.of());

      assertThat(result).hasSize(1);
      CategoryComparison lazer = result.get(0);
      assertThat(lazer.totalA()).isEqualTo(Money.of("100"));
      assertThat(lazer.totalB()).isEqualTo(Money.ZERO);
      // Baseline (A) is non-zero here, so this IS applicable — unlike the zero-baseline case.
      assertThat(lazer.deltaPercent()).isEqualTo(new Percent.Value(new BigDecimal("-100.00")));
    }

    @Test
    void categoryOnlyInMonthBHasNotApplicablePercentSinceBaselineIsZero() {
      List<CategoryComparison> result =
          FinancialComparisonCalculator.compareCategories(
              List.of(), List.of(new CategoryTotal("Educação", Money.of("200"))));

      assertThat(result).hasSize(1);
      CategoryComparison educacao = result.get(0);
      assertThat(educacao.totalA()).isEqualTo(Money.ZERO);
      assertThat(educacao.totalB()).isEqualTo(Money.of("200"));
      assertThat(educacao.deltaPercent()).isEqualTo(new Percent.NotApplicable());
    }

    @Test
    void categoryAbsentFromBothMonthsIsOmittedEntirely() {
      List<CategoryComparison> result =
          FinancialComparisonCalculator.compareCategories(
              List.of(new CategoryTotal("Casa", Money.of("100"))),
              List.of(new CategoryTotal("Casa", Money.of("100"))));

      assertThat(result).extracting(CategoryComparison::category).doesNotContain("Transporte");
    }
  }
}
