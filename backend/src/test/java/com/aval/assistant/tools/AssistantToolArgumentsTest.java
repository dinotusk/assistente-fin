package com.aval.assistant.tools;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.aval.finance.Money;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.math.BigDecimal;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * P5 review gate — proves {@code requireMoney} never routes a monetary value through {@code
 * double}/{@code float}, including on its defensive non-String fallback paths (see the method's
 * own javadoc for why this matters even off the primary string-based contract).
 */
class AssistantToolArgumentsTest {

  @Test
  void decimalStringIsParsedExactly() {
    assertThat(AssistantToolArguments.requireMoney(Map.of("amount", "3500.10"), "amount")).isEqualTo(Money.of("3500.10"));
  }

  @Test
  void bigDecimalArgumentIsUsedExactlyNeverRoutedThroughDouble() {
    // A value double cannot represent exactly — if this ever silently went through
    // doubleValue(), the round-trip would corrupt it; BigDecimal must be used as-is.
    BigDecimal exact = new BigDecimal("0.10");
    assertThat(AssistantToolArguments.requireMoney(Map.of("amount", exact), "amount")).isEqualTo(Money.of("0.10"));
  }

  @Test
  void integerArgumentIsAcceptedExactly() {
    assertThat(AssistantToolArguments.requireMoney(Map.of("amount", 3500), "amount")).isEqualTo(Money.of("3500"));
  }

  @Test
  void longArgumentIsAcceptedExactly() {
    assertThat(AssistantToolArguments.requireMoney(Map.of("amount", 3500L), "amount")).isEqualTo(Money.of("3500"));
  }

  @Test
  void doubleArgumentIsRejectedNeverSilentlyAcceptedThroughLossyConversion() {
    assertThatThrownBy(() -> AssistantToolArguments.requireMoney(Map.of("amount", 3500.10d), "amount"))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.VALIDATION_ERROR));
  }

  @Test
  void floatArgumentIsRejected() {
    assertThatThrownBy(() -> AssistantToolArguments.requireMoney(Map.of("amount", 3500.10f), "amount"))
        .isInstanceOf(ApiException.class);
  }

  @Test
  void missingArgumentIsRejected() {
    assertThatThrownBy(() -> AssistantToolArguments.requireMoney(Map.of(), "amount")).isInstanceOf(ApiException.class);
  }

  @Test
  void malformedStringIsRejected() {
    assertThatThrownBy(() -> AssistantToolArguments.requireMoney(Map.of("amount", "not-a-number"), "amount"))
        .isInstanceOf(ApiException.class);
  }
}
