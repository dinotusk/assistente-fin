package com.aval.platform.errors;

import java.util.List;

/**
 * The single error shape every endpoint in this API returns. Never carries a
 * stack trace, SQL, secrets, internal table/class names, or a token — see
 * {@link GlobalExceptionHandler} for where that boundary is enforced.
 */
public record ApiErrorResponse(
    ApiErrorType type, String message, String requestId, List<ApiErrorDetail> details) {

  public ApiErrorResponse(ApiErrorType type, String message, String requestId) {
    this(type, message, requestId, List.of());
  }
}
