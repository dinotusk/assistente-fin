package com.aval.assistant.orchestration;

import java.util.Map;

/** A tool as declared to the LLM provider — see {@link AssistantToolDefinition#toLlmToolDefinition()}, its only source. */
public record LlmToolDefinition(String name, String description, Map<String, Object> inputSchema) {}
