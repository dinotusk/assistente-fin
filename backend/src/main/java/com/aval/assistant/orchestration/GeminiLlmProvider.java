package com.aval.assistant.orchestration;

import com.aval.platform.config.AvalProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.databind.ObjectMapper;

/**
 * {@link LlmProvider} adapter for Google Gemini's public REST {@code generateContent} endpoint —
 * the exact same provider, model default, env var names, and raw-REST-no-SDK approach the V0
 * PWA's {@code api/gemini-chat.ts} already uses (see docs/architecture/assistant-foundation.md
 * "Provider choice" for why this was preserved rather than replaced). No Gemini-specific type
 * (the private {@code Gemini*} records below) is visible outside this one class — {@link
 * AssistantOrchestrator} only ever sees {@link LlmRequest}/{@link LlmResponse}.
 *
 * <p>Gemini's wire format pairs a tool result to its call by <b>function name</b>, not by an id
 * (unlike, say, OpenAI's {@code tool_call_id}) — {@link LlmToolCall#id()} is a synthetic value
 * this adapter invents when reading a response, used only inside this backend's own generic
 * {@link LlmMessage} history; it is never sent back to Gemini, which only needs the name.
 */
@Service
class GeminiLlmProvider implements LlmProvider {

  private static final Logger log = LoggerFactory.getLogger(GeminiLlmProvider.class);
  private static final String API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

  private final AvalProperties.Gemini config;
  private final ObjectMapper objectMapper;

  GeminiLlmProvider(AvalProperties properties, ObjectMapper objectMapper) {
    this.config = properties.gemini();
    this.objectMapper = objectMapper;
  }

  @Override
  public LlmResponse generate(LlmRequest request) {
    String apiKey = config != null ? config.apiKey() : null;
    if (apiKey == null || apiKey.isBlank()) {
      throw new LlmProviderException("GEMINI_API_KEY/GEMINI_API nao configurada");
    }
    String model = config.model() != null && !config.model().isBlank() ? config.model() : "gemini-2.5-flash";
    long timeoutMs = config.timeoutMs() > 0 ? config.timeoutMs() : 15_000;

    GeminiRequestBody body = toGeminiRequest(request);
    GeminiResponseBody response;
    try {
      response =
          restClient(timeoutMs)
              .post()
              .uri(API_BASE + model + ":generateContent")
              .header("x-goog-api-key", apiKey)
              .header("Content-Type", "application/json")
              .body(body)
              .retrieve()
              .body(GeminiResponseBody.class);
    } catch (RestClientException e) {
      throw new LlmProviderException("Falha na chamada ao provedor de IA", e);
    }

    return toLlmResponse(response);
  }

  private RestClient restClient(long timeoutMs) {
    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
    factory.setConnectTimeout(Duration.ofMillis(timeoutMs));
    factory.setReadTimeout(Duration.ofMillis(timeoutMs));
    return RestClient.builder().requestFactory(factory).build();
  }

  // ---- Generic -> Gemini wire format ----

  private GeminiRequestBody toGeminiRequest(LlmRequest request) {
    StringBuilder systemText = new StringBuilder();
    List<GeminiContent> contents = new ArrayList<>();

    for (LlmMessage message : request.messages()) {
      switch (message.role()) {
        case SYSTEM -> {
          if (message.content() != null) {
            if (!systemText.isEmpty()) systemText.append("\n\n");
            systemText.append(message.content());
          }
        }
        case USER -> contents.add(new GeminiContent("user", List.of(GeminiPart.text(message.content()))));
        case ASSISTANT -> {
          if (message.toolCalls() != null && !message.toolCalls().isEmpty()) {
            List<GeminiPart> parts =
                message.toolCalls().stream()
                    .map(call -> GeminiPart.functionCall(call.name(), call.arguments()))
                    .toList();
            contents.add(new GeminiContent("model", parts));
          } else {
            contents.add(new GeminiContent("model", List.of(GeminiPart.text(message.content()))));
          }
        }
        case TOOL -> contents.add(new GeminiContent("user", List.of(GeminiPart.functionResponse(message.toolName(), parseJsonObject(message.content())))));
      }
    }

    GeminiSystemInstruction systemInstruction =
        !systemText.isEmpty() ? new GeminiSystemInstruction(List.of(GeminiPart.text(systemText.toString()))) : null;

    List<GeminiFunctionDeclaration> declarations =
        request.tools().stream()
            .map(t -> new GeminiFunctionDeclaration(t.name(), t.description(), t.inputSchema()))
            .toList();
    List<GeminiTool> tools = declarations.isEmpty() ? List.of() : List.of(new GeminiTool(declarations));

    GeminiGenerationConfig generationConfig =
        new GeminiGenerationConfig(0.35, 2048, new GeminiThinkingConfig(1024));

    return new GeminiRequestBody(contents, systemInstruction, tools, generationConfig);
  }

  private Map<String, Object> parseJsonObject(String json) {
    try {
      return objectMapper.readValue(json != null ? json : "{}", Map.class);
    } catch (RuntimeException e) {
      return Map.of("error", "INTERNAL_ERROR", "message", "Resultado da ferramenta invalido.");
    }
  }

  // ---- Gemini wire format -> generic ----

  private LlmResponse toLlmResponse(GeminiResponseBody response) {
    if (response == null || response.candidates() == null || response.candidates().isEmpty()) {
      if (response != null && response.promptFeedback() != null && response.promptFeedback().blockReason() != null) {
        throw new LlmProviderException("Resposta bloqueada pelo provedor: " + response.promptFeedback().blockReason());
      }
      throw new LlmProviderException("Resposta vazia do provedor de IA");
    }

    GeminiCandidate candidate = response.candidates().get(0);
    List<GeminiPart> parts = candidate.content() != null ? candidate.content().parts() : List.of();

    List<LlmToolCall> toolCalls =
        parts.stream()
            .filter(p -> p.functionCall() != null)
            .map(p -> new LlmToolCall(java.util.UUID.randomUUID().toString(), p.functionCall().name(), p.functionCall().args()))
            .toList();

    if (!toolCalls.isEmpty()) {
      log.info("gemini response finishReason={} toolCalls={}", candidate.finishReason(), toolCalls.size());
      return new LlmResponse(null, toolCalls, LlmFinishReason.TOOL_CALLS, usageOf(response));
    }

    if ("MAX_TOKENS".equals(candidate.finishReason())) {
      // Parity with the V0 PWA's policy: a cut-off answer is worse than none.
      throw new LlmProviderException("Resposta truncada pelo provedor (MAX_TOKENS)");
    }

    String text = parts.stream().map(GeminiPart::text).filter(java.util.Objects::nonNull).reduce("", (a, b) -> a + b);
    LlmFinishReason finishReason = "SAFETY".equals(candidate.finishReason()) ? LlmFinishReason.SAFETY : LlmFinishReason.STOP;
    log.info("gemini response finishReason={} textLength={}", candidate.finishReason(), text.length());
    return new LlmResponse(text, List.of(), finishReason, usageOf(response));
  }

  private LlmUsage usageOf(GeminiResponseBody response) {
    GeminiUsageMetadata usage = response.usageMetadata();
    if (usage == null) return LlmUsage.UNKNOWN;
    return new LlmUsage(
        usage.promptTokenCount() != null ? usage.promptTokenCount() : 0,
        usage.candidatesTokenCount() != null ? usage.candidatesTokenCount() : 0,
        usage.totalTokenCount() != null ? usage.totalTokenCount() : 0);
  }

  // ---- Wire-format records — never referenced outside this class ----

  @JsonInclude(JsonInclude.Include.NON_NULL)
  private record GeminiRequestBody(
      List<GeminiContent> contents,
      GeminiSystemInstruction systemInstruction,
      List<GeminiTool> tools,
      GeminiGenerationConfig generationConfig) {}

  @JsonInclude(JsonInclude.Include.NON_NULL)
  private record GeminiContent(String role, List<GeminiPart> parts) {}

  @JsonInclude(JsonInclude.Include.NON_NULL)
  private record GeminiPart(String text, GeminiFunctionCall functionCall, GeminiFunctionResponse functionResponse) {
    static GeminiPart text(String text) {
      return new GeminiPart(text, null, null);
    }

    static GeminiPart functionCall(String name, Map<String, Object> args) {
      return new GeminiPart(null, new GeminiFunctionCall(name, args != null ? args : Map.of()), null);
    }

    static GeminiPart functionResponse(String name, Map<String, Object> response) {
      return new GeminiPart(null, null, new GeminiFunctionResponse(name, response));
    }
  }

  private record GeminiFunctionCall(String name, Map<String, Object> args) {}

  private record GeminiFunctionResponse(String name, Map<String, Object> response) {}

  private record GeminiSystemInstruction(List<GeminiPart> parts) {}

  private record GeminiTool(List<GeminiFunctionDeclaration> functionDeclarations) {}

  private record GeminiFunctionDeclaration(String name, String description, Map<String, Object> parameters) {}

  private record GeminiGenerationConfig(double temperature, int maxOutputTokens, GeminiThinkingConfig thinkingConfig) {}

  private record GeminiThinkingConfig(int thinkingBudget) {}

  private record GeminiResponseBody(List<GeminiCandidate> candidates, GeminiPromptFeedback promptFeedback, GeminiUsageMetadata usageMetadata) {}

  private record GeminiCandidate(GeminiContent content, String finishReason) {}

  private record GeminiPromptFeedback(String blockReason) {}

  private record GeminiUsageMetadata(Integer promptTokenCount, Integer candidatesTokenCount, Integer totalTokenCount) {}
}
