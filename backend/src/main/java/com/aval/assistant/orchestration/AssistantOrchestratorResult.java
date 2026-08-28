package com.aval.assistant.orchestration;

import java.util.List;

/** {@link AssistantOrchestrator#handle}'s result — the {@code com.aval.assistant.turns} controller maps this onto {@code AssistantResponse}. */
public record AssistantOrchestratorResult(String answer, List<String> toolsUsed, int toolRounds) {}
