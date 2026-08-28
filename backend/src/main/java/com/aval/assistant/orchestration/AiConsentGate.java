package com.aval.assistant.orchestration;

import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import org.springframework.stereotype.Service;

/**
 * The one place P4 decides "may this user's data reach an external LLM provider" — ported
 * exactly from {@code gemini-chat.ts}'s {@code hasActiveConsent}: fails closed on a missing row,
 * a revoked consent, a missing {@code accepted_at}, or a {@code consent_version} below what the
 * app currently requires. Called once per assistant request, before any message reaches {@link
 * LlmProvider} — never inferred from a client-supplied flag (the request contract has no
 * "consent" field at all; see {@code AssistantRequest}).
 *
 * <p>{@link #REQUIRED_CONSENT_VERSION} must stay equal to the frontend's {@code
 * AI_CONSENT_VERSION} (currently 2 — see {@code src/lib/finance/aiConsent.ts} and
 * {@code supabase/migrations/20260810120000_ai_consent_version_2.sql}). Both this backend and the
 * PWA gate the exact same {@code ai_consents} table, so a version bump is a single reviewed
 * change in two places, not a schema migration.
 */
@Service
public class AiConsentGate {

  static final int REQUIRED_CONSENT_VERSION = 2;

  private final AiConsentRepository repository;

  AiConsentGate(AiConsentRepository repository) {
    this.repository = repository;
  }

  /** @throws ApiException ACCESS_DENIED if consent is missing, revoked, or out of date. */
  public void requireActiveConsent(String userId) {
    boolean active =
        repository
            .findByUserId(userId)
            .filter(row -> row.acceptedAt() != null)
            .filter(row -> row.revokedAt() == null)
            .filter(row -> row.consentVersion() >= REQUIRED_CONSENT_VERSION)
            .isPresent();
    if (!active) {
      throw new ApiException(
          ApiErrorType.ACCESS_DENIED, "Consentimento de IA necessario ou desatualizado.");
    }
  }
}
