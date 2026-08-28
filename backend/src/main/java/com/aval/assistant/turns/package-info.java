/**
 * P4-ASSISTANT-FOUNDATION — the Assistant's HTTP contract: {@link
 * com.aval.assistant.turns.AssistantRequest}/{@link com.aval.assistant.turns.AssistantResponse}
 * (never a householdId/userId, never a client-supplied tool name), {@link
 * com.aval.assistant.turns.AssistantRequestValidation}, and {@link
 * com.aval.assistant.turns.AssistantController} ({@code POST /api/v1/assistant/messages}).
 * Deliberately stateless this round — no conversation history is persisted; see
 * docs/architecture/assistant-foundation.md "Conversation strategy".
 */
package com.aval.assistant.turns;
