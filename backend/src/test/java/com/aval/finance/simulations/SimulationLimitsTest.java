package com.aval.finance.simulations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import com.aval.finance.Money;
import java.time.Duration;
import org.junit.jupiter.api.Test;

/** P5.1 hardening gate — proves the money-parsing boundary rejects abuse fast, never by materializing it first. */
class SimulationLimitsTest {

  @Test
  void valueAtTheMaximumIsAccepted() {
    assertThat(SimulationLimits.parseMoneyOrThrow("999999999999.99")).isEqualTo(SimulationLimits.MAX_MONEY_VALUE);
  }

  @Test
  void valueOneCentAboveTheMaximumIsRejected() {
    assertThatThrownBy(() -> SimulationLimits.parseMoneyOrThrow("1000000000000.00")).isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void exponentNotationAttackIsRejectedImmediatelyNeverMaterializingA1BillionDigitNumber() {
    // "1e999999999" is 11 characters but represents 10^999999999 — if Money.of() ever ran
    // setScale on this, it would try to allocate a ~1-billion-digit BigInteger.
    assertTimeoutPreemptively(
        Duration.ofSeconds(2),
        () -> assertThatThrownBy(() -> SimulationLimits.parseMoneyOrThrow("1e999999999")).isInstanceOf(IllegalArgumentException.class));
  }

  @Test
  void extremeNegativeExponentIsRejectedNotSilentlyRoundedAndNeverHangs() {
    // Empirically verified: unlike the positive-exponent case, this does NOT hang or exhaust
    // memory — BigDecimal.setScale itself throws ArithmeticException ("BigInteger would overflow
    // supported range"). That exception must still surface as a controlled 400, never a raw,
    // uncaught ArithmeticException (which would otherwise reach GlobalExceptionHandler's generic
    // catch-all as a misleading 500).
    assertTimeoutPreemptively(
        Duration.ofSeconds(2),
        () -> assertThatThrownBy(() -> SimulationLimits.parseMoneyOrThrow("1e-999999999")).isInstanceOf(IllegalArgumentException.class));
  }

  @Test
  void hugeLiteralDigitStringIsRejectedByLengthBeforeBigDecimalParsingEvenRuns() {
    String huge = "9".repeat(1000);
    assertTimeoutPreemptively(
        Duration.ofSeconds(2), () -> assertThatThrownBy(() -> SimulationLimits.parseMoneyOrThrow(huge)).isInstanceOf(IllegalArgumentException.class));
  }

  @Test
  void blankOrNullIsRejected() {
    assertThatThrownBy(() -> SimulationLimits.parseMoneyOrThrow(null)).isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> SimulationLimits.parseMoneyOrThrow("  ")).isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void malformedDecimalIsRejected() {
    assertThatThrownBy(() -> SimulationLimits.parseMoneyOrThrow("not-a-number")).isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void normalValueIsUnaffectedByTheGuards() {
    assertThat(SimulationLimits.parseMoneyOrThrow("3500.10")).isEqualTo(Money.of("3500.10"));
  }
}
