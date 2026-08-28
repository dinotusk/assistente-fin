package com.aval.assistant.orchestration;

import java.util.List;

/**
 * One turn in the conversation sent to/from an {@link LlmProvider} — provider-agnostic; no
 * Gemini/OpenAI/Anthropic SDK type ever appears here. Exactly one of the shapes below applies
 * per {@link #role()}:
 *
 * <ul>
 *   <li>{@code SYSTEM}/{@code USER}: {@link #content()} set, {@link #toolCalls()} empty, {@link
 *       #toolCallId()} null.
 *   <li>{@code ASSISTANT}: either {@link #content()} (a final/partial answer) or {@link
 *       #toolCalls()} (a request to call one or more tools before answering) — never both
 *       populated meaningfully at once in this codebase's usage.
 *   <li>{@code TOOL}: {@link #toolCallId()}/{@link #toolName()} identify which {@link
 *       LlmToolCall} this answers, {@link #content()} carries the JSON-serialized result (or a
 *       small JSON error payload — see {@code AssistantOrchestrator}).
 * </ul>
 */
public record LlmMessage(LlmRole role, String content, List<LlmToolCall> toolCalls, String toolCallId, String toolName) {

  public static LlmMessage user(String content) {
    return new LlmMessage(LlmRole.USER, content, List.of(), null, null);
  }

  public static LlmMessage system(String content) {
    return new LlmMessage(LlmRole.SYSTEM, content, List.of(), null, null);
  }

  public static LlmMessage assistantToolCalls(List<LlmToolCall> toolCalls) {
    return new LlmMessage(LlmRole.ASSISTANT, null, toolCalls, null, null);
  }

  public static LlmMessage assistantText(String content) {
    return new LlmMessage(LlmRole.ASSISTANT, content, List.of(), null, null);
  }

  public static LlmMessage toolResult(String toolCallId, String toolName, String resultJson) {
    return new LlmMessage(LlmRole.TOOL, resultJson, List.of(), toolCallId, toolName);
  }
}
