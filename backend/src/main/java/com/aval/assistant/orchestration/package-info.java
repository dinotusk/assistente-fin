/**
 * P4-ASSISTANT-FOUNDATION — the turn controller: {@link com.aval.assistant.orchestration.AssistantOrchestrator}
 * resolves identity/tenancy once ({@link com.aval.assistant.tools.ToolExecutionContext}), drives the
 * {@link com.aval.assistant.orchestration.LlmProvider} request/tool-call/tool-result loop against the
 * closed {@link com.aval.assistant.orchestration.AssistantToolRegistry}, and never lets the model
 * substitute an identity or household. Also hosts the provider abstraction ({@link
 * com.aval.assistant.orchestration.LlmProvider}, {@link com.aval.assistant.orchestration.GeminiLlmProvider}),
 * the server-side system prompt ({@link com.aval.assistant.orchestration.AssistantPrompt}), and the
 * consent/rate-limit gates ({@link com.aval.assistant.orchestration.AiConsentGate}, {@link
 * com.aval.assistant.orchestration.AiRateLimiter}). See docs/architecture/assistant-foundation.md.
 */
package com.aval.assistant.orchestration;
