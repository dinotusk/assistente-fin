package com.aval.assistant.orchestration;

/** Provider-agnostic conversation roles — every {@link LlmProvider} adapter maps its own SDK/REST shape onto this. */
public enum LlmRole {
  SYSTEM,
  USER,
  ASSISTANT,
  TOOL
}
