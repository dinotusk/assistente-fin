package com.aval.assistant.turns;

/**
 * The only shape a client may send to {@code POST /api/v1/assistant/messages}. Deliberately has
 * no {@code householdId}, no {@code userId}, no field for raw financial values, no field for a
 * tool name, and no field that could act as a system prompt override — every one of those is
 * either resolved server-side ({@code householdId}/{@code userId}, from the JWT) or simply has
 * no legitimate reason to exist on this contract.
 *
 * @param message the user's question, required, max {@link AssistantRequestValidation#MAX_MESSAGE_LENGTH}.
 * @param conversationId optional, client-chosen correlation token (must be a UUID) — P4 is
 *     stateless (see docs/architecture/assistant-foundation.md "Conversation strategy"): this is
 *     echoed back in {@link AssistantResponse}, never looked up against any stored history.
 * @param month optional UI hint (YYYY-MM) — never trusted as financial data; see {@code
 *     AssistantOrchestrator}'s {@code uiHint} javadoc.
 * @param scope optional UI hint ({@code me}/{@code household}/{@code profile}).
 * @param profileId optional UI hint, required to be a UUID when present.
 */
public record AssistantRequest(String message, String conversationId, String month, String scope, String profileId) {}
