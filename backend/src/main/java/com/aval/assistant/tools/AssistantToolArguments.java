package com.aval.assistant.tools;

import com.aval.finance.Money;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Reads a model-supplied {@code arguments} map defensively — every accessor throws {@link
 * ApiException} (VALIDATION_ERROR) on a missing/wrong-typed value instead of a raw {@code
 * ClassCastException}/{@code NullPointerException}, so {@code AssistantOrchestrator} can turn a
 * malformed tool call into a controlled tool-result error the model can react to, never a crash.
 */
final class AssistantToolArguments {

  private AssistantToolArguments() {}

  static String requireString(Map<String, Object> arguments, String key) {
    Object value = arguments.get(key);
    if (!(value instanceof String s) || s.isBlank()) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "Argumento obrigatorio ausente ou invalido: " + key);
    }
    return s;
  }

  static String optionalString(Map<String, Object> arguments, String key) {
    Object value = arguments.get(key);
    return value instanceof String s && !s.isBlank() ? s : null;
  }

  static int optionalInt(Map<String, Object> arguments, String key, int defaultValue) {
    Object value = arguments.get(key);
    if (value == null) return defaultValue;
    if (value instanceof Number n) return n.intValue();
    if (value instanceof String s) {
      try {
        return Integer.parseInt(s.trim());
      } catch (NumberFormatException e) {
        throw new ApiException(ApiErrorType.VALIDATION_ERROR, "Argumento invalido: " + key);
      }
    }
    throw new ApiException(ApiErrorType.VALIDATION_ERROR, "Argumento invalido: " + key);
  }

  /**
   * Parses a monetary argument — the model is instructed (via the tool's JSON schema) to send a
   * decimal string, e.g. {@code "3500.00"}, never a bare JSON number (a double round-trip could
   * silently lose exact cents). A {@code Number} is still accepted defensively, converted via
   * {@link BigDecimal#valueOf(double)} (exact-decimal-string based, not {@code new
   * BigDecimal(double)}) — never trusted as the primary contract.
   */
  static Money requireMoney(Map<String, Object> arguments, String key) {
    Object value = arguments.get(key);
    try {
      if (value instanceof String s && !s.isBlank()) return Money.of(new BigDecimal(s.trim()));
      if (value instanceof Number n) return Money.of(BigDecimal.valueOf(n.doubleValue()));
    } catch (NumberFormatException | ArithmeticException e) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "Argumento monetario invalido: " + key);
    }
    throw new ApiException(ApiErrorType.VALIDATION_ERROR, "Argumento obrigatorio ausente ou invalido: " + key);
  }

  static Optional<Money> optionalMoney(Map<String, Object> arguments, String key) {
    if (arguments.get(key) == null) return Optional.empty();
    return Optional.of(requireMoney(arguments, key));
  }

  static Optional<UUID> optionalUuid(Map<String, Object> arguments, String key) {
    String raw = optionalString(arguments, key);
    if (raw == null) return Optional.empty();
    try {
      return Optional.of(UUID.fromString(raw));
    } catch (IllegalArgumentException e) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "Argumento invalido (UUID esperado): " + key);
    }
  }
}
