package com.aval.assistant.orchestration;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.function.Function;

/**
 * Deterministic, in-memory {@link LlmProvider} test double — no network, no API key, no quota,
 * no real-model non-determinism (Fase 14). Scripted as a fixed sequence of {@link LlmResponse}s
 * returned in order on each {@link #generate} call, or a single always-repeating response, or a
 * function of the request (for asserting what the orchestrator actually sent).
 */
public final class FakeLlmProvider implements LlmProvider {

  private final Deque<LlmResponse> script;
  private final Function<LlmRequest, LlmResponse> fallback;
  private LlmRequest lastRequest;
  private int callCount;

  private FakeLlmProvider(Deque<LlmResponse> script, Function<LlmRequest, LlmResponse> fallback) {
    this.script = script;
    this.fallback = fallback;
  }

  public static FakeLlmProvider script(LlmResponse... responses) {
    return new FakeLlmProvider(new ArrayDeque<>(List.of(responses)), null);
  }

  public static FakeLlmProvider alwaysThrowing() {
    return new FakeLlmProvider(new ArrayDeque<>(), req -> {
      throw new LlmProviderException("fake provider failure");
    });
  }

  /** Repeats the same tool call forever — for proving the orchestrator's round/call limits actually stop it. */
  public static FakeLlmProvider loopingToolCall(String toolName, java.util.Map<String, Object> arguments) {
    return new FakeLlmProvider(
        new ArrayDeque<>(),
        req -> new LlmResponse(null, List.of(new LlmToolCall("call-1", toolName, arguments)), LlmFinishReason.TOOL_CALLS, LlmUsage.UNKNOWN));
  }

  @Override
  public LlmResponse generate(LlmRequest request) {
    callCount++;
    lastRequest = request;
    if (!script.isEmpty()) {
      return script.poll();
    }
    if (fallback != null) {
      return fallback.apply(request);
    }
    throw new IllegalStateException("FakeLlmProvider script exhausted with no fallback");
  }

  public LlmRequest lastRequest() {
    return lastRequest;
  }

  public int callCount() {
    return callCount;
  }
}
