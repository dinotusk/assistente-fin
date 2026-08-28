package com.aval.assistant.tools;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import com.aval.finance.Money;
import com.aval.finance.simulations.SimulationLimits;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.math.BigDecimal;
import java.time.Duration;
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

  @Test
  void valueAtTheMaximumRepresentableLimitIsAccepted() {
    assertThat(AssistantToolArguments.requireMoney(Map.of("amount", "999999999999.99"), "amount"))
        .isEqualTo(SimulationLimits.MAX_MONEY_VALUE);
  }

  @Test
  void valueAboveTheMaximumRepresentableLimitIs400ViaTheStandardErrorContract() {
    assertThatThrownBy(() -> AssistantToolArguments.requireMoney(Map.of("amount", "1000000000000.00"), "amount"))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.VALIDATION_ERROR));
  }

  @Test
  void exponentNotationAbuseIsRejectedImmediatelyThroughTheRealEntryPointNeverA500() {
    assertTimeoutPreemptively(
        Duration.ofSeconds(2),
        () ->
            assertThatThrownBy(() -> AssistantToolArguments.requireMoney(Map.of("amount", "1e999999999"), "amount"))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.VALIDATION_ERROR)));
  }

  @Test
  void extremeNegativeExponentIsAlsoRejectedAsAControlled400NeverARawArithmeticException() {
    assertTimeoutPreemptively(
        Duration.ofSeconds(2),
        () ->
            assertThatThrownBy(() -> AssistantToolArguments.requireMoney(Map.of("amount", "1e-999999999"), "amount"))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.VALIDATION_ERROR)));
  }

  @Test
  void hugeLiteralDigitStringIsRejectedByLengthWithoutEverConstructingTheBigDecimal() {
    String huge = "9".repeat(1000);
    assertTimeoutPreemptively(
        Duration.ofSeconds(2), () -> assertThatThrownBy(() -> AssistantToolArguments.requireMoney(Map.of("amount", huge), "amount")).isInstanceOf(ApiException.class));
  }
}
