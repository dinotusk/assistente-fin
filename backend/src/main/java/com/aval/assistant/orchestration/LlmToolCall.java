package com.aval.assistant.orchestration;

import java.util.Map;

/**
 * One function-call the model requested. {@code id} is the provider's own call-correlation
 * token (echoed back in the matching {@link LlmRole#TOOL} message) — never generated or
 * interpreted by this codebase, only round-tripped. {@code arguments} is the raw, untrusted
 * JSON object the model produced — {@link com.aval.assistant.tools} adapters are exactly what
 * validates it before anything touches the Financial Domain; nothing here trusts its shape.
 */
public record LlmToolCall(String id, String name, Map<String, Object> arguments) {}
