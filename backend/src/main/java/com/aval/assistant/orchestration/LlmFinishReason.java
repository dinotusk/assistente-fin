package com.aval.assistant.orchestration;

/** Why an {@link LlmResponse} ended — provider-agnostic; every adapter maps its own reason codes onto this closed set. */
public enum LlmFinishReason {
  STOP,
  TOOL_CALLS,
  MAX_TOKENS,
  SAFETY,
  ERROR
}
