package com.aval.platform.errors;

import java.util.List;
import org.springframework.http.HttpStatus;

/**
 * Base type for errors domain/application code throws deliberately. {@link
 * GlobalExceptionHandler} maps it straight to an {@link ApiErrorResponse}
 * with the matching HTTP status — no domain code needs to know a status
 * code, only which {@link ApiErrorType} its failure is.
 *
 * <p>No financial/business subclasses exist yet this round (P1 ships no
 * business endpoints) — this is the extension point P2-FINANCIAL-DOMAIN
 * builds on, e.g. a future {@code ExpenseNotFoundException extends
 * ApiException}.
 */
public class ApiException extends RuntimeException {

  private final ApiErrorType type;
  private final List<ApiErrorDetail> details;

  public ApiException(ApiErrorType type, String message) {
    this(type, message, List.of());
  }

  public ApiException(ApiErrorType type, String message, List<ApiErrorDetail> details) {
    super(message);
    this.type = type;
    this.details = details;
  }

  public ApiErrorType type() {
    return type;
  }

  public List<ApiErrorDetail> details() {
    return details;
  }

  public HttpStatus httpStatus() {
    return switch (type) {
      case VALIDATION_ERROR -> HttpStatus.BAD_REQUEST;
      case AUTHENTICATION_REQUIRED -> HttpStatus.UNAUTHORIZED;
      case ACCESS_DENIED -> HttpStatus.FORBIDDEN;
      case RESOURCE_NOT_FOUND -> HttpStatus.NOT_FOUND;
      case CONFLICT -> HttpStatus.CONFLICT;
      case RATE_LIMITED -> HttpStatus.TOO_MANY_REQUESTS;
      case EXTERNAL_SERVICE_ERROR -> HttpStatus.BAD_GATEWAY;
      case INTERNAL_ERROR -> HttpStatus.INTERNAL_SERVER_ERROR;
    };
  }

  public static ApiException notFound(String message) {
    return new ApiException(ApiErrorType.RESOURCE_NOT_FOUND, message);
  }

  public static ApiException conflict(String message) {
    return new ApiException(ApiErrorType.CONFLICT, message);
  }

  public static ApiException accessDenied(String message) {
    return new ApiException(ApiErrorType.ACCESS_DENIED, message);
  }
}
