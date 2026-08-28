package com.aval.assistant.orchestration;

import java.util.List;

/**
 * One full round-trip request to an {@link LlmProvider} — the entire conversation so far
 * (system prompt + user/assistant/tool turns) plus the closed set of tools the model is allowed
 * to call this round. {@code tools} is always exactly {@link AssistantToolRegistry#definitions()}
 * — no caller ever passes a different set, so the model can never be offered a tool the registry
 * doesn't know about.
 */
public record LlmRequest(List<LlmMessage> messages, List<LlmToolDefinition> tools) {}
