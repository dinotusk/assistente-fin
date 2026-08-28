package com.aval.assistant.orchestration;

/** LLM-facing metadata for one {@link AssistantTool} — everything the provider needs to decide whether to call it. */
public record AssistantToolDefinition(String name, String description, java.util.Map<String, Object> inputSchema) {

  public static AssistantToolDefinition from(AssistantTool tool) {
    return new AssistantToolDefinition(tool.name(), tool.description(), tool.inputSchema());
  }

  public LlmToolDefinition toLlmToolDefinition() {
    return new LlmToolDefinition(name, description, inputSchema);
  }
}
