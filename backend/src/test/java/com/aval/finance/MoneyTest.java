package com.aval.finance;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class MoneyTest {

  @Test
  void zeroIsZero() {
    assertThat(Money.ZERO.isZero()).isTrue();
    assertThat(Money.ZERO.value()).isEqualByComparingTo("0.00");
  }

  @Test
  void oneCentIsRepresentedExactly() {
    Money cent = Money.of("0.01");
    assertThat(cent.value()).isEqualByComparingTo("0.01");
    assertThat(cent.isPositive()).isTrue();
  }

  @Test
  void negativeValuesAreSupported() {
    Money negative = Money.of("-50.00");
    assertThat(negative.isNegative()).isTrue();
    assertThat(negative.isPositive()).isFalse();
  }

  @Test
  void largeValuesWithinNumeric14_2Fit() {
    Money large = Money.of("999999999999.99");
    assertThat(large.value()).isEqualByComparingTo("999999999999.99");
  }

  @Test
  void additionIsExact() {
    Money result = Money.of("100.10").add(Money.of("0.20"));
    assertThat(result.value()).isEqualByComparingTo("100.30");
  }

  @Test
  void subtractionCanGoNegative() {
    Money result = Money.of("100.00").subtract(Money.of("150.00"));
    assertThat(result).isEqualTo(Money.of("-50.00"));
    assertThat(result.isNegative()).isTrue();
  }

  @Test
  void equalityIsByDecimalValueNotScale() {
    assertThat(Money.of(new BigDecimal("5"))).isEqualTo(Money.of(new BigDecimal("5.00")));
  }

  @Test
  void comparisonOrdersByValue() {
    assertThat(Money.of("10.00").compareTo(Money.of("5.00"))).isPositive();
    assertThat(Money.max(Money.of("10.00"), Money.of("20.00"))).isEqualTo(Money.of("20.00"));
  }

  @Test
  void toStringIsPlainDecimalNeverScientificNotation() {
    assertThat(Money.of("1234567.89").toString()).isEqualTo("1234567.89");
  }
}
