package com.aval.platform.errors;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * Pure unit tests — no Spring context needed to prove the handler's actual
 * job: exactly one response shape, the right HTTP status per {@link
 * ApiErrorType}, and never leaking the real exception's message or class
 * name for unexpected failures.
 */
class GlobalExceptionHandlerTest {

  private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

  @AfterEach
  void clearMdc() {
    MDC.clear();
  }

  @Test
  void apiExceptionMapsToItsOwnDeclaredHttpStatus() {
    ApiException notFound = ApiException.notFound("Recurso não encontrado.");
    ResponseEntity<ApiErrorResponse> response = handler.handleApiException(notFound);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    assertThat(response.getBody().type()).isEqualTo(ApiErrorType.RESOURCE_NOT_FOUND);
    assertThat(response.getBody().message()).isEqualTo("Recurso não encontrado.");
  }

  @Test
  void apiExceptionCarriesItsRequestIdFromMdc() {
    MDC.put(com.aval.platform.web.RequestIdFilter.MDC_KEY, "req-42");
    ResponseEntity<ApiErrorResponse> response =
        handler.handleApiException(ApiException.conflict("Conflito."));
    assertThat(response.getBody().requestId()).isEqualTo("req-42");
  }

  @Test
  void unexpectedExceptionNeverLeaksItsOwnMessageOrClassName() {
    RuntimeException sensitive =
        new RuntimeException("SELECT * FROM expenses WHERE household_id = 42 failed: secret-detail");
    ResponseEntity<ApiErrorResponse> response = handler.handleUnexpected(sensitive);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
    assertThat(response.getBody().type()).isEqualTo(ApiErrorType.INTERNAL_ERROR);
    assertThat(response.getBody().message()).doesNotContain("SELECT", "expenses", "secret-detail");
    assertThat(response.getBody().message()).doesNotContain("RuntimeException");
  }

  @Test
  void accessDeniedExceptionMapsToForbiddenWithoutLeakingItsOwnMessage() {
    org.springframework.security.access.AccessDeniedException denied =
        new org.springframework.security.access.AccessDeniedException(
            "internal: user 7 lacks ROLE_ADMIN on household 42");
    ResponseEntity<ApiErrorResponse> response = handler.handleAccessDenied(denied);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    assertThat(response.getBody().type()).isEqualTo(ApiErrorType.ACCESS_DENIED);
    assertThat(response.getBody().message()).doesNotContain("household", "ROLE_ADMIN");
  }

  @Test
  void apiExceptionValidationDetailsAreCarriedThrough() {
    List<ApiErrorDetail> details = List.of(new ApiErrorDetail("amount", "deve ser positivo"));
    ApiException validation = new ApiException(ApiErrorType.VALIDATION_ERROR, "Dados inválidos.", details);

    ResponseEntity<ApiErrorResponse> response = handler.handleApiException(validation);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody().details()).containsExactly(new ApiErrorDetail("amount", "deve ser positivo"));
  }
}
