package com.aval.assistant.turns;

import com.aval.assistant.orchestration.AiConsentGate;
import com.aval.assistant.orchestration.AiRateLimiter;
import com.aval.assistant.orchestration.AssistantOrchestrator;
import com.aval.assistant.orchestration.AssistantOrchestratorResult;
import com.aval.platform.auth.AuthenticatedUser;
import io.swagger.v3.oas.annotations.Operation;
import java.time.Instant;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code POST /api/v1/assistant/messages} — the one HTTP entry point into the Aval Assistant.
 * Flow: JWT (Spring Security, before this method even runs) -&gt; {@link AuthenticatedUser} -&gt;
 * consent check -&gt; rate limit check -&gt; {@link AssistantOrchestrator} (which itself resolves
 * tenancy, drives the LLM/tool loop, and never lets the model substitute an identity or
 * household). Never accepts a {@code householdId} — see {@link AssistantRequest}'s javadoc.
 */
@RestController
public class AssistantController {

  private final AiConsentGate consentGate;
  private final AiRateLimiter rateLimiter;
  private final AssistantOrchestrator orchestrator;

  public AssistantController(AiConsentGate consentGate, AiRateLimiter rateLimiter, AssistantOrchestrator orchestrator) {
    this.consentGate = consentGate;
    this.rateLimiter = rateLimiter;
    this.orchestrator = orchestrator;
  }

  @Operation(
      summary = "Ask the Aval Assistant a financial question",
      description =
          "Requires prior AI consent (see ai_consents) and is subject to a shared rate limit with "
              + "the PWA's own assistant. The assistant answers exclusively from the five Financial "
              + "Tools' data — it never calculates or invents a financial number itself. Never "
              + "accepts a householdId or userId; both are resolved from the caller's own JWT.")
  @PostMapping("/api/v1/assistant/messages")
  public AssistantResponse sendMessage(@AuthenticationPrincipal Jwt jwt, @RequestBody AssistantRequest request) {
    AuthenticatedUser user = AuthenticatedUser.fromJwt(jwt);
    String uiHint = AssistantRequestValidation.validateAndBuildHint(request);

    consentGate.requireActiveConsent(user.id());
    rateLimiter.requireWithinLimit(user.id());

    AssistantOrchestratorResult result = orchestrator.handle(user, request.message(), uiHint);

    String conversationId =
        request.conversationId() != null && !request.conversationId().isBlank()
            ? request.conversationId()
            : UUID.randomUUID().toString();

    return new AssistantResponse(
        result.answer(), conversationId, com.aval.platform.web.RequestContext.currentRequestId(), result.toolsUsed(), Instant.now().toString());
  }
}
