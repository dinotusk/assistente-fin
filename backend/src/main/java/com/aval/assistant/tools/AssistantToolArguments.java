package com.aval.assistant.tools;

import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.util.Map;

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
}
