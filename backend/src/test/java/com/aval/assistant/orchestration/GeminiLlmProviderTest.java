package com.aval.assistant.orchestration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.aval.platform.config.AvalProperties;
import java.net.SocketTimeoutException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

/**
 * {@link GeminiLlmProvider} against Spring's own {@code MockRestServiceServer} — an in-process
 * fake HTTP layer built into spring-test (already on the classpath via
 * spring-boot-starter-test), the mock appropriate to this codebase's existing {@link RestClient}
 * stack. No real socket, no real network, no API key, no internet requirement.
 */
class GeminiLlmProviderTest {

  private static final String FAKE_KEY = "fake-test-key-not-a-real-secret";
  private static final String EXPECTED_URL =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

  private final ObjectMapper objectMapper = new ObjectMapper();

  private record Harness(GeminiLlmProvider provider, MockRestServiceServer server) {}

  private Harness harness() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    RestClient restClient = builder.build();
    AvalProperties.Gemini geminiConfig = new AvalProperties.Gemini(FAKE_KEY, "gemini-2.5-flash", 2000);
    AvalProperties properties = new AvalProperties(null, null, geminiConfig);
    GeminiLlmProvider provider = new GeminiLlmProvider(properties, objectMapper, restClient);
    return new Harness(provider, server);
  }

  // ---- A. normal text response ----

  @Test
  void normalTextResponseBecomesAFinalLlmResponse() {
    Harness h = harness();
    String responseJson =
        """
        {"candidates":[{"content":{"role":"model","parts":[{"text":"Ola, tudo bem?"}]},"finishReason":"STOP"}],
         "usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5,"totalTokenCount":15}}
        """;
    h.server()
        .expect(requestTo(EXPECTED_URL))
        .andExpect(method(HttpMethod.POST))
        .andRespond(withSuccess(responseJson, MediaType.APPLICATION_JSON));

    LlmResponse response = h.provider().generate(new LlmRequest(List.of(LlmMessage.user("oi")), List.of()));

    assertThat(response.content()).isEqualTo("Ola, tudo bem?");
    assertThat(response.toolCalls()).isEmpty();
    assertThat(response.finishReason()).isEqualTo(LlmFinishReason.STOP);
    assertThat(response.usage()).isEqualTo(new LlmUsage(10, 5, 15));
    h.server().verify();
  }

  // ---- B. functionCall parsing ----

  @Test
  void functionCallResponseProducesACorrectLlmToolCall() {
    Harness h = harness();
    String responseJson =
        """
        {"candidates":[{"content":{"role":"model","parts":[
          {"functionCall":{"name":"get_financial_summary","args":{"month":"2026-08","scope":"household"}}}
        ]},"finishReason":"STOP"}]}
        """;
    h.server().expect(requestTo(EXPECTED_URL)).andRespond(withSuccess(responseJson, MediaType.APPLICATION_JSON));

    LlmResponse response = h.provider().generate(new LlmRequest(List.of(LlmMessage.user("quanto gastei?")), List.of()));

    assertThat(response.finishReason()).isEqualTo(LlmFinishReason.TOOL_CALLS);
    assertThat(response.toolCalls()).hasSize(1);
    LlmToolCall call = response.toolCalls().get(0);
    assertThat(call.name()).isEqualTo("get_financial_summary");
    assertThat(call.arguments()).isEqualTo(Map.of("month", "2026-08", "scope", "household"));
    assertThat(call.id()).isNotBlank();
  }

  // ---- D. multiple function calls in one response ----

  @Test
  void multipleFunctionCallsInOneResponseAreAllParsed() {
    Harness h = harness();
    String responseJson =
        """
        {"candidates":[{"content":{"role":"model","parts":[
          {"functionCall":{"name":"get_household_profiles","args":{}}},
          {"functionCall":{"name":"get_financial_summary","args":{"month":"2026-08","scope":"household"}}}
        ]},"finishReason":"STOP"}]}
        """;
    h.server().expect(requestTo(EXPECTED_URL)).andRespond(withSuccess(responseJson, MediaType.APPLICATION_JSON));

    LlmResponse response = h.provider().generate(new LlmRequest(List.of(LlmMessage.user("oi")), List.of()));

    assertThat(response.toolCalls()).extracting(LlmToolCall::name).containsExactly("get_household_profiles", "get_financial_summary");
  }

  // ---- C. functionResponse outbound request shape ----

  @Test
  void toolResultMessageIsSerializedAsAFunctionResponsePartWithUserRole() {
    Harness h = harness();
    String responseJson = """
        {"candidates":[{"content":{"role":"model","parts":[{"text":"ok"}]},"finishReason":"STOP"}]}
        """;
    h.server()
        .expect(requestTo(EXPECTED_URL))
        .andExpect(jsonPath("$.contents[0].role").value("user"))
        .andExpect(jsonPath("$.contents[1].role").value("model"))
        .andExpect(jsonPath("$.contents[1].parts[0].functionCall.name").value("get_financial_summary"))
        .andExpect(jsonPath("$.contents[2].role").value("user"))
        .andExpect(jsonPath("$.contents[2].parts[0].functionResponse.name").value("get_financial_summary"))
        .andExpect(jsonPath("$.contents[2].parts[0].functionResponse.response.total").value("1600.00"))
        .andRespond(withSuccess(responseJson, MediaType.APPLICATION_JSON));

    List<LlmMessage> messages =
        List.of(
            LlmMessage.user("quanto gastei?"),
            LlmMessage.assistantToolCalls(List.of(new LlmToolCall("c1", "get_financial_summary", Map.of("month", "2026-08")))),
            LlmMessage.toolResult("c1", "get_financial_summary", "{\"total\":\"1600.00\"}"));

    h.provider().generate(new LlmRequest(messages, List.of()));
    h.server().verify();
  }

  @Test
  void toolDeclarationsAreSentAsFunctionDeclarationsWithTheirJsonSchema() {
    Harness h = harness();
    String responseJson = """
        {"candidates":[{"content":{"role":"model","parts":[{"text":"ok"}]},"finishReason":"STOP"}]}
        """;
    h.server()
        .expect(requestTo(EXPECTED_URL))
        .andExpect(jsonPath("$.tools[0].functionDeclarations[0].name").value("get_goals"))
        .andExpect(jsonPath("$.tools[0].functionDeclarations[0].parameters.type").value("object"))
        .andExpect(jsonPath("$.systemInstruction.parts[0].text").value("seja breve"))
        .andRespond(withSuccess(responseJson, MediaType.APPLICATION_JSON));

    LlmToolDefinition def = new LlmToolDefinition("get_goals", "lista metas", Map.of("type", "object", "properties", Map.of()));
    h.provider()
        .generate(new LlmRequest(List.of(LlmMessage.system("seja breve"), LlmMessage.user("oi")), List.of(def)));
    h.server().verify();
  }

  // ---- E. HTTP 429 ----

  @Test
  void httpTooManyRequestsBecomesAControlledErrorWithNoRetryAndNoLeakedBody() {
    Harness h = harness();
    h.server()
        .expect(requestTo(EXPECTED_URL))
        .andRespond(
            withStatus(HttpStatus.TOO_MANY_REQUESTS)
                .body("{\"error\":{\"message\":\"quota exceeded for key " + FAKE_KEY + "\"}}")
                .contentType(MediaType.APPLICATION_JSON));

    assertThatThrownBy(() -> h.provider().generate(new LlmRequest(List.of(LlmMessage.user("oi")), List.of())))
        .isInstanceOf(LlmProviderException.class)
        .satisfies(e -> assertThat(e.getMessage()).doesNotContain(FAKE_KEY));

    // Exactly one request expected/matched — MockRestServiceServer.verify() fails if the
    // provider retried (a second, unmatched request would also fail eagerly at execute time).
    h.server().verify();
  }

  // ---- F. HTTP 5xx ----

  @Test
  void httpServerErrorBecomesAControlledError() {
    Harness h = harness();
    h.server().expect(requestTo(EXPECTED_URL)).andRespond(withServerError());

    assertThatThrownBy(() -> h.provider().generate(new LlmRequest(List.of(LlmMessage.user("oi")), List.of())))
        .isInstanceOf(LlmProviderException.class);
    h.server().verify();
  }

  // ---- G. timeout ----

  @Test
  void transportTimeoutBecomesAControlledError() {
    Harness h = harness();
    h.server()
        .expect(requestTo(EXPECTED_URL))
        .andRespond(request -> {
          throw new SocketTimeoutException("Read timed out");
        });

    assertThatThrownBy(() -> h.provider().generate(new LlmRequest(List.of(LlmMessage.user("oi")), List.of())))
        .isInstanceOf(LlmProviderException.class);
  }

  // ---- H. invalid/incomplete JSON ----

  @Test
  void syntacticallyInvalidJsonBodyFailsSafely() {
    Harness h = harness();
    h.server().expect(requestTo(EXPECTED_URL)).andRespond(withSuccess("not json at all", MediaType.APPLICATION_JSON));

    assertThatThrownBy(() -> h.provider().generate(new LlmRequest(List.of(LlmMessage.user("oi")), List.of())))
        .isInstanceOf(LlmProviderException.class);
  }

  @Test
  void structurallyValidButEmptyResponseFailsSafely() {
    Harness h = harness();
    h.server().expect(requestTo(EXPECTED_URL)).andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

    assertThatThrownBy(() -> h.provider().generate(new LlmRequest(List.of(LlmMessage.user("oi")), List.of())))
        .isInstanceOf(LlmProviderException.class)
        .hasMessageContaining("vazia");
  }

  @Test
  void blockedResponseFailsSafelyWithTheBlockReasonNeverAFabricatedAnswer() {
    Harness h = harness();
    String responseJson = """
        {"candidates":[],"promptFeedback":{"blockReason":"SAFETY"}}
        """;
    h.server().expect(requestTo(EXPECTED_URL)).andRespond(withSuccess(responseJson, MediaType.APPLICATION_JSON));

    assertThatThrownBy(() -> h.provider().generate(new LlmRequest(List.of(LlmMessage.user("oi")), List.of())))
        .isInstanceOf(LlmProviderException.class)
        .hasMessageContaining("SAFETY");
  }

  @Test
  void maxTokensFinishReasonIsTreatedAsAFailureNeverATruncatedAnswer() {
    Harness h = harness();
    String responseJson =
        """
        {"candidates":[{"content":{"role":"model","parts":[{"text":"resposta cortada no me"}]},"finishReason":"MAX_TOKENS"}]}
        """;
    h.server().expect(requestTo(EXPECTED_URL)).andRespond(withSuccess(responseJson, MediaType.APPLICATION_JSON));

    assertThatThrownBy(() -> h.provider().generate(new LlmRequest(List.of(LlmMessage.user("oi")), List.of())))
        .isInstanceOf(LlmProviderException.class);
  }

  // ---- I/J. no sensitive data in the outgoing request; API key only in the auth header ----

  @Test
  void outgoingRequestNeverCarriesJwtUserIdHouseholdIdEmailOrTheApiKeyInItsBody() {
    Harness h = harness();
    AtomicReference<String> capturedBody = new AtomicReference<>();
    AtomicReference<String> capturedApiKeyHeader = new AtomicReference<>();
    String responseJson = """
        {"candidates":[{"content":{"role":"model","parts":[{"text":"ok"}]},"finishReason":"STOP"}]}
        """;

    h.server()
        .expect(requestTo(EXPECTED_URL))
        .andExpect(header("x-goog-api-key", FAKE_KEY))
        .andExpect(
            request -> {
              MockClientHttpRequest mockRequest = (MockClientHttpRequest) request;
              capturedBody.set(mockRequest.getBodyAsString());
              capturedApiKeyHeader.set(request.getHeaders().getFirst("x-goog-api-key"));
            })
        .andRespond(withSuccess(responseJson, MediaType.APPLICATION_JSON));

    String uiHintWithNoSecrets = "Contexto da interface: mes atual em tela = 2026-08.";
    h.provider()
        .generate(
            new LlmRequest(
                List.of(LlmMessage.system("prompt de sistema"), LlmMessage.system(uiHintWithNoSecrets), LlmMessage.user("qual meu saldo?")),
                List.of()));

    String body = capturedBody.get();
    assertThat(body).doesNotContain(FAKE_KEY);
    assertThat(body).doesNotContainIgnoringCase("bearer ");
    assertThat(body).doesNotContainIgnoringCase("authorization");
    assertThat(body).doesNotContainIgnoringCase("jwt");
    assertThat(body).doesNotContainIgnoringCase("@example.com");
    // The API key travels exclusively via this one header — never duplicated into the body.
    assertThat(capturedApiKeyHeader.get()).isEqualTo(FAKE_KEY);
    h.server().verify();
  }

  @Test
  void apiKeyNeverAppearsInAThrownExceptionsMessage() {
    Harness h = harness();
    h.server()
        .expect(requestTo(EXPECTED_URL))
        .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR).body("upstream failure, key=" + FAKE_KEY));

    assertThatThrownBy(() -> h.provider().generate(new LlmRequest(List.of(LlmMessage.user("oi")), List.of())))
        .isInstanceOf(LlmProviderException.class)
        .satisfies(e -> assertThat(e.getMessage()).doesNotContain(FAKE_KEY));
  }

  @Test
  void missingApiKeyFailsBeforeAnyHttpCallIsMade() {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    RestClient restClient = builder.build();
    AvalProperties properties = new AvalProperties(null, null, new AvalProperties.Gemini(null, "gemini-2.5-flash", 2000));
    GeminiLlmProvider provider = new GeminiLlmProvider(properties, objectMapper, restClient);

    assertThatThrownBy(() -> provider.generate(new LlmRequest(List.of(LlmMessage.user("oi")), List.of())))
        .isInstanceOf(LlmProviderException.class);
    server.verify(); // no expectations set, none consumed — proves no HTTP call was attempted
  }
}
