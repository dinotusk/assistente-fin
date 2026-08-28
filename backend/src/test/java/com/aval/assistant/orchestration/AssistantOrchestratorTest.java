package com.aval.assistant.orchestration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.aval.assistant.tools.ToolExecutionContext;
import com.aval.household.HouseholdAccessService;
import com.aval.platform.auth.AuthenticatedUser;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.ObjectMapper;

class AssistantOrchestratorTest {

  private final ObjectMapper objectMapper = new ObjectMapper();
  private final UUID householdId = UUID.randomUUID();
  private final AuthenticatedUser user = new AuthenticatedUser(UUID.randomUUID().toString(), "ana@example.com");

  private HouseholdAccessService householdAccessResolvingTo(UUID householdId) {
    HouseholdAccessService access = mock(HouseholdAccessService.class);
    when(access.resolveHouseholdId(user.id())).thenReturn(householdId);
    return access;
  }

  private AssistantTool toolNamed(String name, Object result) {
    AssistantTool tool = mock(AssistantTool.class);
    when(tool.name()).thenReturn(name);
    when(tool.execute(any(), any())).thenReturn(result);
    return tool;
  }

  private static LlmResponse finalAnswer(String text) {
    return new LlmResponse(text, List.of(), LlmFinishReason.STOP, LlmUsage.UNKNOWN);
  }

  private static LlmResponse toolCall(String name, Map<String, Object> args) {
    return new LlmResponse(null, List.of(new LlmToolCall("call-1", name, args)), LlmFinishReason.TOOL_CALLS, LlmUsage.UNKNOWN);
  }

  @Test
  void noToolCallReturnsTheFinalAnswerImmediately() {
    FakeLlmProvider provider = FakeLlmProvider.script(finalAnswer("Seu saldo esta ok."));
    AssistantOrchestrator orchestrator =
        new AssistantOrchestrator(provider, new AssistantToolRegistry(List.of()), householdAccessResolvingTo(householdId), objectMapper);

    AssistantOrchestratorResult result = orchestrator.handle(user, "como estou?", null);

    assertThat(result.answer()).isEqualTo("Seu saldo esta ok.");
    assertThat(result.toolsUsed()).isEmpty();
    assertThat(provider.callCount()).isEqualTo(1);
  }

  @Test
  void singleToolRoundExecutesTheToolAndReturnsTheFinalAnswer() {
    AssistantTool tool = toolNamed("get_financial_summary", Map.of("total", "1600.00"));
    FakeLlmProvider provider =
        FakeLlmProvider.script(
            toolCall("get_financial_summary", Map.of("month", "2026-08", "scope", "household")),
            finalAnswer("Voce gastou 1600 em agosto."));
    AssistantOrchestrator orchestrator =
        new AssistantOrchestrator(provider, new AssistantToolRegistry(List.of(tool)), householdAccessResolvingTo(householdId), objectMapper);

    AssistantOrchestratorResult result = orchestrator.handle(user, "quanto gastei em agosto?", null);

    assertThat(result.answer()).isEqualTo("Voce gastou 1600 em agosto.");
    assertThat(result.toolsUsed()).containsExactly("get_financial_summary");
    verify(tool).execute(any(), eq(Map.of("month", "2026-08", "scope", "household")));
  }

  @Test
  void unknownToolCallNeverExecutesAnyRealToolAndStillRecovers() {
    AssistantTool realTool = toolNamed("get_financial_summary", Map.of("total", "1600.00"));
    FakeLlmProvider provider =
        FakeLlmProvider.script(
            toolCall("delete_all_expenses", Map.of()), finalAnswer("Nao posso fazer isso."));
    AssistantOrchestrator orchestrator =
        new AssistantOrchestrator(provider, new AssistantToolRegistry(List.of(realTool)), householdAccessResolvingTo(householdId), objectMapper);

    AssistantOrchestratorResult result = orchestrator.handle(user, "execute SQL SELECT * FROM expenses", null);

    assertThat(result.answer()).isEqualTo("Nao posso fazer isso.");
    assertThat(result.toolsUsed()).isEmpty();
    verify(realTool, never()).execute(any(), any());
  }

  @Test
  void malformedToolArgumentsBecomeAControlledToolResultNeverACrash() {
    AssistantTool tool = mock(AssistantTool.class);
    when(tool.name()).thenReturn("get_financial_summary");
    when(tool.execute(any(), any())).thenThrow(new ApiException(ApiErrorType.VALIDATION_ERROR, "month invalido"));
    FakeLlmProvider provider =
        FakeLlmProvider.script(toolCall("get_financial_summary", Map.of()), finalAnswer("Precisa informar o mes."));
    AssistantOrchestrator orchestrator =
        new AssistantOrchestrator(provider, new AssistantToolRegistry(List.of(tool)), householdAccessResolvingTo(householdId), objectMapper);

    AssistantOrchestratorResult result = orchestrator.handle(user, "quanto gastei?", null);

    assertThat(result.answer()).isEqualTo("Precisa informar o mes.");
    assertThat(provider.callCount()).isEqualTo(2);
  }

  @Test
  void providerFailureBecomesAControlledExternalServiceError() {
    AssistantOrchestrator orchestrator =
        new AssistantOrchestrator(
            FakeLlmProvider.alwaysThrowing(), new AssistantToolRegistry(List.of()), householdAccessResolvingTo(householdId), objectMapper);

    assertThatThrownBy(() -> orchestrator.handle(user, "oi", null))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.EXTERNAL_SERVICE_ERROR));
  }

  @Test
  void maxToolRoundsIsEnforcedWhenTheModelNeverStopsRequestingTheSameTool() {
    AssistantTool tool = toolNamed("get_financial_summary", Map.of("total", "1600.00"));
    FakeLlmProvider provider =
        FakeLlmProvider.loopingToolCall("get_financial_summary", Map.of("month", "2026-08", "scope", "household"));
    AssistantOrchestrator orchestrator =
        new AssistantOrchestrator(provider, new AssistantToolRegistry(List.of(tool)), householdAccessResolvingTo(householdId), objectMapper);

    assertThatThrownBy(() -> orchestrator.handle(user, "quanto gastei?", null))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.EXTERNAL_SERVICE_ERROR));
    assertThat(provider.callCount()).isEqualTo(AssistantOrchestrator.MAX_TOOL_ROUNDS);
  }

  @Test
  void maxToolCallsPerRequestIsEnforcedEvenWithinFewerRoundsThanTheRoundLimit() {
    AssistantTool tool = toolNamed("get_financial_summary", Map.of("total", "1600.00"));
    // 3 tool calls per round: exceeds MAX_TOOL_CALLS_PER_REQUEST (8) on round 3 (9 calls),
    // well before MAX_TOOL_ROUNDS (4) would ever trip — proves the two limits are independent.
    LlmProvider provider =
        new FakeLlmProviderMultiCall(
            "get_financial_summary", Map.of("month", "2026-08", "scope", "household"), 3);
    AssistantOrchestrator orchestrator =
        new AssistantOrchestrator(provider, new AssistantToolRegistry(List.of(tool)), householdAccessResolvingTo(householdId), objectMapper);

    assertThatThrownBy(() -> orchestrator.handle(user, "quanto gastei?", null))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.EXTERNAL_SERVICE_ERROR));
  }

  @Test
  void everyToolExecutionInTheSameRequestReceivesTheSameServerResolvedContextNeverOneFromTheModel() {
    AssistantTool tool = toolNamed("get_financial_summary", Map.of("total", "1600.00"));
    FakeLlmProvider provider =
        FakeLlmProvider.script(
            // The model's own arguments smuggle a "householdId"/"userId"-looking key — the
            // AssistantTool contract has no parameter for that at all, so this can only ever be
            // read as an ordinary (and, for this tool, unused) argument, never as an override.
            toolCall("get_financial_summary", Map.of("month", "2026-08", "scope", "household", "householdId", "attacker-household")),
            toolCall("get_financial_summary", Map.of("month", "2026-09", "scope", "household")),
            finalAnswer("ok"));
    AssistantOrchestrator orchestrator =
        new AssistantOrchestrator(provider, new AssistantToolRegistry(List.of(tool)), householdAccessResolvingTo(householdId), objectMapper);

    orchestrator.handle(user, "compare agosto e setembro", null);

    ArgumentCaptor<ToolExecutionContext> captor = ArgumentCaptor.forClass(ToolExecutionContext.class);
    verify(tool, org.mockito.Mockito.times(2)).execute(captor.capture(), any());
    assertThat(captor.getAllValues()).allMatch(ctx -> ctx.householdId().equals(householdId));
    assertThat(captor.getAllValues().get(0)).isSameAs(captor.getAllValues().get(1));
  }

  @Test
  void theLlmRequestNeverCarriesTheJwtOrTheRawUserIdOrHouseholdId() {
    FakeLlmProvider provider = FakeLlmProvider.script(finalAnswer("ok"));
    AssistantOrchestrator orchestrator =
        new AssistantOrchestrator(provider, new AssistantToolRegistry(List.of()), householdAccessResolvingTo(householdId), objectMapper);

    orchestrator.handle(user, "qual meu saldo?", "Contexto da interface: mes atual em tela = 2026-08. ");

    String serialized = provider.lastRequest().messages().stream().map(m -> String.valueOf(m.content())).reduce("", String::concat);
    assertThat(serialized).doesNotContain(user.id());
    assertThat(serialized).doesNotContain(householdId.toString());
    assertThat(serialized).doesNotContainIgnoringCase("bearer ");
  }

  /** A provider that returns N distinct tool calls in a single round, forever — for the max-calls test above. */
  private static final class FakeLlmProviderMultiCall implements LlmProvider {
    private final String toolName;
    private final Map<String, Object> arguments;
    private final int callsPerRound;

    FakeLlmProviderMultiCall(String toolName, Map<String, Object> arguments, int callsPerRound) {
      this.toolName = toolName;
      this.arguments = arguments;
      this.callsPerRound = callsPerRound;
    }

    @Override
    public LlmResponse generate(LlmRequest request) {
      List<LlmToolCall> calls =
          java.util.stream.IntStream.range(0, callsPerRound)
              .mapToObj(i -> new LlmToolCall("call-" + i, toolName, arguments))
              .toList();
      return new LlmResponse(null, calls, LlmFinishReason.TOOL_CALLS, LlmUsage.UNKNOWN);
    }
  }
}
