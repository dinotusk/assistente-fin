package com.aval.assistant.orchestration;

import java.util.List;

/**
 * One model turn. Exactly one of {@code content} (a real or partial answer) or a non-empty
 * {@code toolCalls} is the meaningful payload, discriminated by {@code finishReason}:
 * {@link LlmFinishReason#TOOL_CALLS} means {@code toolCalls} drives the next step, anything else
 * means {@code content} is the (possibly final) answer.
 */
public record LlmResponse(String content, List<LlmToolCall> toolCalls, LlmFinishReason finishReason, LlmUsage usage) {}
