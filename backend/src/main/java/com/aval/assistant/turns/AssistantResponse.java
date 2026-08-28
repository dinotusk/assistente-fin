package com.aval.assistant.turns;

import java.util.List;

/**
 * @param answer the model's final answer text.
 * @param conversationId echoes {@link AssistantRequest#conversationId()} verbatim when the client
 *     sent one, otherwise a fresh one — always present so a client can start threading a
 *     conversation even on its first message.
 * @param requestId the same correlation id every other endpoint's error responses carry (see
 *     {@code RequestIdFilter}) — never client-supplied.
 * @param toolsUsed the stable names of every Financial Tool actually called while producing this
 *     answer, in call order — lets a client show "orcamento consultado" style transparency
 *     without parsing the answer text.
 * @param generatedAt server-generated ISO-8601 timestamp.
 */
public record AssistantResponse(
    String answer, String conversationId, String requestId, List<String> toolsUsed, String generatedAt) {}
