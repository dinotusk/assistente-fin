package com.aval.assistant.orchestration;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.aval.assistant.orchestration.AiConsentRepository.ConsentRow;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.time.OffsetDateTime;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** Ports gemini-chat.ts's hasActiveConsent fail-closed rules — see AiConsentGate's javadoc. */
class AiConsentGateTest {

  private static final String USER_ID = "11111111-1111-1111-1111-111111111111";

  @Test
  void noConsentRowIsDenied() {
    AiConsentRepository repository = mock(AiConsentRepository.class);
    when(repository.findByUserId(USER_ID)).thenReturn(Optional.empty());
    AiConsentGate gate = new AiConsentGate(repository);

    assertThatThrownBy(() -> gate.requireActiveConsent(USER_ID))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> org.assertj.core.api.Assertions.assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.ACCESS_DENIED));
  }

  @Test
  void revokedConsentIsDenied() {
    AiConsentRepository repository = mock(AiConsentRepository.class);
    when(repository.findByUserId(USER_ID))
        .thenReturn(Optional.of(new ConsentRow(AiConsentGate.REQUIRED_CONSENT_VERSION, OffsetDateTime.now(), OffsetDateTime.now())));
    AiConsentGate gate = new AiConsentGate(repository);

    assertThatThrownBy(() -> gate.requireActiveConsent(USER_ID)).isInstanceOf(ApiException.class);
  }

  @Test
  void outOfDateConsentVersionIsDenied() {
    AiConsentRepository repository = mock(AiConsentRepository.class);
    when(repository.findByUserId(USER_ID))
        .thenReturn(Optional.of(new ConsentRow(AiConsentGate.REQUIRED_CONSENT_VERSION - 1, OffsetDateTime.now(), null)));
    AiConsentGate gate = new AiConsentGate(repository);

    assertThatThrownBy(() -> gate.requireActiveConsent(USER_ID)).isInstanceOf(ApiException.class);
  }

  @Test
  void missingAcceptedAtIsDenied() {
    AiConsentRepository repository = mock(AiConsentRepository.class);
    when(repository.findByUserId(USER_ID))
        .thenReturn(Optional.of(new ConsentRow(AiConsentGate.REQUIRED_CONSENT_VERSION, null, null)));
    AiConsentGate gate = new AiConsentGate(repository);

    assertThatThrownBy(() -> gate.requireActiveConsent(USER_ID)).isInstanceOf(ApiException.class);
  }

  @Test
  void activeUpToDateConsentIsAllowed() {
    AiConsentRepository repository = mock(AiConsentRepository.class);
    when(repository.findByUserId(USER_ID))
        .thenReturn(Optional.of(new ConsentRow(AiConsentGate.REQUIRED_CONSENT_VERSION, OffsetDateTime.now(), null)));
    AiConsentGate gate = new AiConsentGate(repository);

    assertThatCode(() -> gate.requireActiveConsent(USER_ID)).doesNotThrowAnyException();
  }
}
