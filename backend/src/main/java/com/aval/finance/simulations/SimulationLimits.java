package com.aval.finance.simulations;

import com.aval.finance.Money;
import java.math.BigDecimal;

/**
 * Operational anti-abuse ceilings for simulation inputs — explicitly NOT financial-advice rules
 * (a 121st installment isn't "bad financial advice", it's simply outside what this API accepts).
 * See docs/architecture/simulation-engine.md "Input hardening" for the rationale behind each
 * number. Enforced at two layers, both before any allocation/iteration proportional to the
 * input: the {@code AssistantTool} adapters/HTTP controllers (producing a proper {@code 400
 * VALIDATION_ERROR}), and defensively inside the pure calculators themselves (an {@code
 * IllegalArgumentException} — never reached via the real entry points, but a real guard if this
 * package is ever called some other way).
 */
public final class SimulationLimits {

  private SimulationLimits() {}

  /** A purchase or a savings plan lasting more than 10 years (120 months) is outside this tool's intended horizon. */
  public static final int MIN_INSTALLMENTS = 1;
  public static final int MAX_INSTALLMENTS = 120;

  public static final int MIN_MONTHS = 0;
  public static final int MAX_MONTHS = 1200;

  /**
   * The exact ceiling every real money column in this schema already enforces —
   * {@code numeric(14,2)}: 12 integer digits, 2 decimal (see docs/architecture/financial-domain.md
   * "Money"). Not an arbitrary smaller cap: a simulation input is never persisted, but staying
   * within the same magnitude every real value in this system already respects keeps "hypothetical"
   * and "real" money directly comparable, and rejects a value no genuine financial record here
   * could ever hold in the first place.
   */
  public static final Money MAX_MONEY_VALUE = Money.of(new BigDecimal("999999999999.99"));

  public static boolean exceedsMaxMoney(Money value) {
    return value.compareTo(MAX_MONEY_VALUE) > 0;
  }

  public static boolean isWithinInstallmentBounds(int installments) {
    return installments >= MIN_INSTALLMENTS && installments <= MAX_INSTALLMENTS;
  }

  public static boolean isWithinMonthsBounds(int months) {
    return months >= MIN_MONTHS && months <= MAX_MONTHS;
  }

  /** Longer than any legitimate value ("-999999999999.99" is 17 chars) — rejected before {@code new BigDecimal(...)} ever runs, so a multi-megabyte digit string can't be parsed at all. */
  private static final int MAX_MONEY_STRING_LENGTH = 32;

  /** {@code numeric(14,2)}'s own integer-digit capacity — see {@link #MAX_MONEY_VALUE}. */
  private static final int MAX_INTEGER_DIGITS = 12;

  /**
   * Rejects a value whose <b>integer</b> digit count exceeds what {@code numeric(14,2)} (and
   * {@link #MAX_MONEY_VALUE}) can hold — checked via {@code precision() - scale()}, which never
   * materializes the value's actual digits (cheap even for an adversarial input) — before {@link
   * Money#of(BigDecimal)} would otherwise call {@code setScale}, which for a value like {@code
   * 1e999999999} (an 11-character string whose unscaled value is just {@code 1}, but whose scale
   * is {@code -999999999}) would force materializing a ~1-billion-digit {@link
   * java.math.BigInteger} — a real, exploitable memory/CPU exhaustion vector this check exists
   * specifically to close.
   */
  public static void assertRepresentable(BigDecimal value) {
    if (value.precision() - value.scale() > MAX_INTEGER_DIGITS) {
      throw new IllegalArgumentException("value exceeds the maximum representable amount");
    }
  }

  /**
   * Safe end-to-end parsing for an external, untrusted monetary string: length-capped before
   * {@link BigDecimal#BigDecimal(String)} ever runs (blocks a huge-literal-digit-string attack),
   * magnitude-checked via {@link #assertRepresentable} before {@link Money#of(BigDecimal)} ever
   * calls {@code setScale} (blocks the exponent-notation attack described there), and finally
   * re-checked against {@link #MAX_MONEY_VALUE} for defense in depth.
   */
  public static Money parseMoneyOrThrow(String raw) {
    if (raw == null || raw.isBlank()) {
      throw new IllegalArgumentException("value is required");
    }
    String trimmed = raw.trim();
    if (trimmed.length() > MAX_MONEY_STRING_LENGTH) {
      throw new IllegalArgumentException("value exceeds the maximum representable amount");
    }
    BigDecimal parsed;
    try {
      parsed = new BigDecimal(trimmed);
    } catch (NumberFormatException e) {
      throw new IllegalArgumentException("value is not a valid decimal", e);
    }
    return toBoundedMoney(parsed);
  }

  /**
   * Same magnitude checks as {@link #parseMoneyOrThrow}, for a {@link BigDecimal}/{@link Number}
   * argument that didn't arrive as a raw string (e.g. Jackson may deserialize a JSON number
   * straight into a {@code BigDecimal}).
   *
   * <p>{@link #assertRepresentable} rejects most dangerous magnitudes before {@link
   * Money#of(BigDecimal)} ever calls {@code setScale}, but an extreme <b>negative</b> exponent
   * (e.g. {@code 1e-999999999} — {@code precision() - scale()} is a large *negative* number
   * there, so it passes that check) makes {@code setScale} throw a raw {@link ArithmeticException}
   * ("BigInteger would overflow supported range") instead of hanging or exhausting memory —
   * caught here and normalized into the same {@link IllegalArgumentException} every other
   * rejection in this class already throws, so every caller only ever needs to catch one type.
   */
  public static Money toBoundedMoney(BigDecimal value) {
    assertRepresentable(value);
    Money money;
    try {
      money = Money.of(value);
    } catch (ArithmeticException e) {
      throw new IllegalArgumentException("value is not representable", e);
    }
    if (exceedsMaxMoney(money)) {
      throw new IllegalArgumentException("value exceeds the maximum representable amount");
    }
    return money;
  }
}
