package com.aval.assistant.turns;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import org.junit.jupiter.api.Test;

class AssistantRequestValidationTest {

  @Test
  void blankMessageIsRejected() {
    assertThatThrownBy(() -> AssistantRequestValidation.validateAndBuildHint(new AssistantRequest("  ", null, null, null, null)))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.VALIDATION_ERROR));
  }

  @Test
  void messageOverTheLengthLimitIsRejected() {
    String tooLong = "a".repeat(AssistantRequestValidation.MAX_MESSAGE_LENGTH + 1);
    assertThatThrownBy(() -> AssistantRequestValidation.validateAndBuildHint(new AssistantRequest(tooLong, null, null, null, null)))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.VALIDATION_ERROR));
  }

  @Test
  void nonUuidConversationIdIsRejected() {
    assertThatThrownBy(
            () -> AssistantRequestValidation.validateAndBuildHint(new AssistantRequest("oi", "not-a-uuid", null, null, null)))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.VALIDATION_ERROR));
  }

  @Test
  void malformedMonthIsRejected() {
    assertThatThrownBy(
            () -> AssistantRequestValidation.validateAndBuildHint(new AssistantRequest("oi", null, "agosto/2026", null, null)))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.VALIDATION_ERROR));
  }

  @Test
  void unknownScopeIsRejected() {
    assertThatThrownBy(
            () -> AssistantRequestValidation.validateAndBuildHint(new AssistantRequest("oi", null, null, "everyone", null)))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.VALIDATION_ERROR));
  }

  @Test
  void nonUuidProfileIdIsRejected() {
    assertThatThrownBy(
            () -> AssistantRequestValidation.validateAndBuildHint(new AssistantRequest("oi", null, null, "profile", "Rafael")))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.VALIDATION_ERROR));
  }

  @Test
  void profileIdWithoutScopeProfileIsRejected() {
    String uuid = java.util.UUID.randomUUID().toString();
    assertThatThrownBy(
            () -> AssistantRequestValidation.validateAndBuildHint(new AssistantRequest("oi", null, null, "household", uuid)))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.VALIDATION_ERROR));
  }

  @Test
  void validRequestWithNoHintsProducesNoHintText() {
    String hint = AssistantRequestValidation.validateAndBuildHint(new AssistantRequest("oi", null, null, null, null));
    assertThat(hint).isNull();
  }

  @Test
  void validRequestWithHintsProducesAPlainTextHintNeverAsAFinancialValue() {
    String hint = AssistantRequestValidation.validateAndBuildHint(new AssistantRequest("oi", null, "2026-08", "household", null));
    assertThat(hint).contains("2026-08").contains("household");
  }

  @Test
  void validConversationIdIsAccepted() {
    String uuid = java.util.UUID.randomUUID().toString();
    // Must not throw.
    AssistantRequestValidation.validateAndBuildHint(new AssistantRequest("oi", uuid, null, null, null));
  }
}
