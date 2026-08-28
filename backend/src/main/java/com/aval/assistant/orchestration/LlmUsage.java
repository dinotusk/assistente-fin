package com.aval.assistant.orchestration;

/** Token accounting for one {@link LlmProvider#generate} call — logged (Fase 17), never the content that produced it. */
public record LlmUsage(int promptTokens, int completionTokens, int totalTokens) {

  public static final LlmUsage UNKNOWN = new LlmUsage(0, 0, 0);
}
