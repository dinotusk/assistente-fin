package com.aval.assistant.orchestration;

import com.aval.assistant.tools.ToolExecutionContext;
import com.aval.household.HouseholdAccessService;
import com.aval.platform.auth.AuthenticatedUser;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

/**
 * The turn controller (per {@code com.aval.assistant} package-info's original plan): builds a
 * {@link ToolExecutionContext} once, drives the request/tool-call/tool-result loop against an
 * {@link LlmProvider}, and never lets the model substitute its own household or identity — every
 * {@link AssistantTool#execute} call in this loop receives the exact same context built at the
 * top, from the caller's own {@link AuthenticatedUser}, never anything derived from the model's
 * output.
 *
 * <p><b>Loop limits</b> (Fase 7 — conservative, documented): {@link #MAX_TOOL_ROUNDS} request/
 * response round-trips to the provider, {@link #MAX_TOOL_CALLS_PER_REQUEST} total tool
 * executions across the whole request. A real financial question needs at most a couple of tool
 * calls (e.g. {@code get_household_profiles} then {@code get_financial_summary}); these ceilings
 * exist purely to bound cost/latency/blast-radius if a provider ever loops, not because normal
 * usage approaches them.
 */
@Service
public class AssistantOrchestrator {

  private static final Logger log = LoggerFactory.getLogger(AssistantOrchestrator.class);

  static final int MAX_TOOL_ROUNDS = 4;
  static final int MAX_TOOL_CALLS_PER_REQUEST = 8;

  private final LlmProvider llmProvider;
  private final AssistantToolRegistry registry;
  private final HouseholdAccessService householdAccess;
  private final ObjectMapper objectMapper;

  public AssistantOrchestrator(
      LlmProvider llmProvider,
      AssistantToolRegistry registry,
      HouseholdAccessService householdAccess,
      ObjectMapper objectMapper) {
    this.llmProvider = llmProvider;
    this.registry = registry;
    this.householdAccess = householdAccess;
    this.objectMapper = objectMapper;
  }

  /**
   * @param uiHint an optional, plain-text note about what the client's UI currently shows (e.g.
   *     "O usuario esta visualizando o mes 2026-08, escopo household") — never financial data
   *     itself, never trusted as a substitute for a tool call; the model must still call a tool
   *     to get real numbers even when a hint mentions a month/scope.
   */
  public AssistantOrchestratorResult handle(AuthenticatedUser user, String userMessage, String uiHint) {
    ToolExecutionContext context = ToolExecutionContext.resolve(user, householdAccess);
    List<LlmToolDefinition> toolDefinitions =
        registry.definitions().stream().map(AssistantToolDefinition::toLlmToolDefinition).toList();

    List<LlmMessage> messages = new ArrayList<>();
    messages.add(LlmMessage.system(AssistantPrompt.SYSTEM_PROMPT));
    if (uiHint != null && !uiHint.isBlank()) {
      messages.add(LlmMessage.system(uiHint));
    }
    messages.add(LlmMessage.user(userMessage));

    List<String> toolsUsed = new ArrayList<>();
    int totalToolCalls = 0;

    for (int round = 1; round <= MAX_TOOL_ROUNDS; round++) {
      LlmResponse response = callProvider(messages, toolDefinitions);

      if (response.toolCalls() == null || response.toolCalls().isEmpty()) {
        log.info("assistant round={} toolCallsThisRequest={} finalized=true", round, totalToolCalls);
        return new AssistantOrchestratorResult(
            response.content() != null ? response.content() : "", List.copyOf(toolsUsed), round);
      }

      messages.add(LlmMessage.assistantToolCalls(response.toolCalls()));

      for (LlmToolCall call : response.toolCalls()) {
        totalToolCalls++;
        if (totalToolCalls > MAX_TOOL_CALLS_PER_REQUEST) {
          log.warn("assistant aborted: tool call limit exceeded, requested={}", totalToolCalls);
          throw new ApiException(
              ApiErrorType.EXTERNAL_SERVICE_ERROR, "O assistente tentou chamar ferramentas demais para esta pergunta.");
        }
        String resultJson = executeSingleCall(context, call, toolsUsed);
        messages.add(LlmMessage.toolResult(call.id(), call.name(), resultJson));
      }
    }

    log.warn("assistant aborted: max tool rounds exceeded, rounds={}", MAX_TOOL_ROUNDS);
    throw new ApiException(
        ApiErrorType.EXTERNAL_SERVICE_ERROR, "O assistente nao conseguiu concluir a resposta a tempo.");
  }

  private LlmResponse callProvider(List<LlmMessage> messages, List<LlmToolDefinition> toolDefinitions) {
    try {
      return llmProvider.generate(new LlmRequest(List.copyOf(messages), toolDefinitions));
    } catch (LlmProviderException e) {
      log.error("LLM provider failure: {}", e.getMessage());
      throw new ApiException(ApiErrorType.EXTERNAL_SERVICE_ERROR, "Assistente indisponivel no momento.");
    }
  }

  /**
   * Never throws — a tool that doesn't exist, rejects its arguments, or fails a tenancy check
   * becomes a JSON error payload fed back to the model as a normal {@link LlmRole#TOOL} message,
   * so the model can react honestly ("nao encontrei dados") instead of the whole request failing.
   */
  private String executeSingleCall(ToolExecutionContext context, LlmToolCall call, List<String> toolsUsed) {
    Optional<AssistantTool> tool = registry.find(call.name());
    if (tool.isEmpty()) {
      log.warn("assistant rejected unknown tool call: {}", call.name());
      return errorJson("UNKNOWN_TOOL", "Ferramenta desconhecida.");
    }
    try {
      Object result = tool.get().execute(context, call.arguments() != null ? call.arguments() : Map.of());
      toolsUsed.add(call.name());
      return objectMapper.writeValueAsString(result);
    } catch (ApiException e) {
      return errorJson(e.type().name(), e.getMessage());
    } catch (RuntimeException e) {
      log.error("Unexpected error executing tool {}: {}", call.name(), e.getMessage());
      return errorJson("INTERNAL_ERROR", "Erro ao executar a ferramenta.");
    }
  }

  private String errorJson(String type, String message) {
    try {
      return objectMapper.writeValueAsString(Map.of("error", type, "message", message));
    } catch (RuntimeException e) {
      return "{\"error\":\"INTERNAL_ERROR\",\"message\":\"Erro ao executar a ferramenta.\"}";
    }
  }
}
