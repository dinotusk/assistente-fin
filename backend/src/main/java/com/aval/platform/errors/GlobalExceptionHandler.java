package com.aval.platform.errors;

import com.aval.platform.web.RequestContext;
import jakarta.validation.ConstraintViolationException;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Every exception this API can produce funnels through here into exactly
 * one shape: {@link ApiErrorResponse}. Never returns a stack trace, SQL,
 * internal class/table names, secrets, or a token — {@link
 * #handleUnexpected} logs the real exception (server-side only, tagged with
 * the request id) and returns a generic message instead.
 *
 * <p>This does not catch authentication/authorization failures that Spring
 * Security's filter chain raises before a request reaches a controller
 * (e.g. a missing/invalid bearer token) — those are handled by the {@code
 * AuthenticationEntryPoint}/{@code AccessDeniedHandler} beans in {@link
 * com.aval.platform.config.SecurityConfig}, which build the exact same
 * {@link ApiErrorResponse} shape so callers never see two different error
 * formats depending on where a 401/403 originated.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

  private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

  @ExceptionHandler(ApiException.class)
  public ResponseEntity<ApiErrorResponse> handleApiException(ApiException ex) {
    return respond(ex.httpStatus(), ex.type(), ex.getMessage(), ex.details());
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<ApiErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
    List<ApiErrorDetail> details =
        ex.getBindingResult().getFieldErrors().stream()
            .map(fieldError -> new ApiErrorDetail(fieldError.getField(), fieldError.getDefaultMessage()))
            .toList();
    return respond(HttpStatus.BAD_REQUEST, ApiErrorType.VALIDATION_ERROR, "Dados inválidos.", details);
  }

  @ExceptionHandler(ConstraintViolationException.class)
  public ResponseEntity<ApiErrorResponse> handleConstraintViolation(ConstraintViolationException ex) {
    List<ApiErrorDetail> details =
        ex.getConstraintViolations().stream()
            .map(v -> new ApiErrorDetail(v.getPropertyPath().toString(), v.getMessage()))
            .toList();
    return respond(HttpStatus.BAD_REQUEST, ApiErrorType.VALIDATION_ERROR, "Dados inválidos.", details);
  }

  @ExceptionHandler(AccessDeniedException.class)
  public ResponseEntity<ApiErrorResponse> handleAccessDenied(AccessDeniedException ex) {
    return respond(HttpStatus.FORBIDDEN, ApiErrorType.ACCESS_DENIED, "Acesso negado.", List.of());
  }

  // A genuinely unmapped route (no controller, no static resource) — must
  // stay a 404, not fall through to the catch-all 500 below, which would
  // make every unmapped URL look like a server bug instead of a missing one.
  @ExceptionHandler(NoResourceFoundException.class)
  public ResponseEntity<ApiErrorResponse> handleNoResourceFound(NoResourceFoundException ex) {
    return respond(HttpStatus.NOT_FOUND, ApiErrorType.RESOURCE_NOT_FOUND, "Recurso não encontrado.", List.of());
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<ApiErrorResponse> handleUnexpected(Exception ex) {
    log.error("Unhandled exception for request {}", RequestContext.currentRequestId(), ex);
    return respond(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ApiErrorType.INTERNAL_ERROR,
        "Ocorreu um erro interno. Tente novamente.",
        List.of());
  }

  private ResponseEntity<ApiErrorResponse> respond(
      HttpStatus status, ApiErrorType type, String message, List<ApiErrorDetail> details) {
    ApiErrorResponse body =
        new ApiErrorResponse(type, message, RequestContext.currentRequestId(), details);
    return ResponseEntity.status(status).body(body);
  }
}
