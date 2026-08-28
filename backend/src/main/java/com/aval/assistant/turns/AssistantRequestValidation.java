package com.aval.assistant.turns;

import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.time.DateTimeException;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.Set;
import java.util.UUID;

/**
 * Fail-closed validation for {@link AssistantRequest} — every field is checked before the
 * message ever reaches {@code AssistantOrchestrator}/an LLM provider. Mirrors the strictness the
 * V0 PWA's {@code aiRequestValidation.ts} already applies (max length, closed value sets), ported
 * to the new, much smaller contract (no arbitrary "context" object exists here at all — see
 * {@code AssistantRequest}'s javadoc for why).
 */
public final class AssistantRequestValidation {

  /** Generous for a real financial question, far below prompt-abuse territory — same order of magnitude as V0's 2000-char question cap. */
  public static final int MAX_MESSAGE_LENGTH = 4000;

  private static final Set<String> VALID_SCOPES = Set.of("me", "household", "profile");
  private static final DateTimeFormatter MONTH_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM");

  private AssistantRequestValidation() {}

  /** @return a plain-text UI hint sentence (never raw values), or null if no hints were supplied. */
  public static String validateAndBuildHint(AssistantRequest request) {
    validateMessage(request.message());
    validateConversationId(request.conversationId());
    YearMonth month = validateMonth(request.month());
    String scope = validateScope(request.scope());
    validateProfileId(request.profileId(), scope);

    if (month == null && scope == null) {
      return null;
    }
    StringBuilder hint = new StringBuilder("Contexto da interface (apenas indicativo, sempre confirme via ferramenta): ");
    if (month != null) hint.append("mes atual em tela = ").append(month).append(". ");
    if (scope != null) hint.append("escopo atual em tela = ").append(scope).append(". ");
    if (request.profileId() != null && !request.profileId().isBlank()) {
      hint.append("profileId atual em tela = ").append(request.profileId()).append(". ");
    }
    return hint.toString();
  }

  private static void validateMessage(String message) {
    if (message == null || message.isBlank()) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "message e obrigatoria.");
    }
    if (message.length() > MAX_MESSAGE_LENGTH) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "message excede o tamanho maximo permitido.");
    }
  }

  private static void validateConversationId(String conversationId) {
    if (conversationId == null || conversationId.isBlank()) return;
    try {
      UUID.fromString(conversationId);
    } catch (IllegalArgumentException e) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "conversationId deve ser um UUID valido.");
    }
  }

  private static YearMonth validateMonth(String month) {
    if (month == null || month.isBlank()) return null;
    try {
      return YearMonth.parse(month, MONTH_FORMAT);
    } catch (DateTimeException e) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "month deve estar no formato YYYY-MM.");
    }
  }

  private static String validateScope(String scope) {
    if (scope == null || scope.isBlank()) return null;
    if (!VALID_SCOPES.contains(scope)) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "scope deve ser um de: me, household, profile.");
    }
    return scope;
  }

  private static void validateProfileId(String profileId, String scope) {
    if (profileId == null || profileId.isBlank()) return;
    try {
      UUID.fromString(profileId);
    } catch (IllegalArgumentException e) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "profileId deve ser um UUID valido.");
    }
    if (!"profile".equals(scope)) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "profileId so e valido quando scope=profile.");
    }
  }
}
