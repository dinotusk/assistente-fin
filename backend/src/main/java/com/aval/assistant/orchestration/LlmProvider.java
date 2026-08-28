package com.aval.assistant.orchestration;

/**
 * The one seam between {@link AssistantOrchestrator} and any concrete model vendor. No Gemini,
 * OpenAI, or Anthropic type is visible on this interface or anywhere else in {@code
 * com.aval.assistant.*} outside the one adapter implementing it — see {@code GeminiLlmProvider}.
 * Swapping providers means writing a new adapter class, never touching the orchestrator, the
 * tool registry, or the Financial Tools.
 */
public interface LlmProvider {

  /** @throws LlmProviderException on any transport/provider failure — never a raw SDK/HTTP exception. */
  LlmResponse generate(LlmRequest request);
}
