package com.aval.assistant.orchestration;

import com.aval.platform.config.AvalProperties;
import java.time.Duration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Builds the single {@link RestClient} {@link GeminiLlmProvider} calls Gemini's REST API
 * through, with the configured connect/read timeout ({@code aval.gemini.timeout-ms}, default
 * 15s — same order of magnitude as the V0 PWA's own Gemini timeout).
 *
 * <p>Separated into its own bean (rather than built inline in {@code GeminiLlmProvider}'s
 * constructor) so a test can substitute a {@code RestClient.Builder} bound to Spring's {@code
 * MockRestServiceServer} — a fake, in-process HTTP layer with zero real sockets/ports/network —
 * without changing {@code GeminiLlmProvider} itself or the {@link LlmProvider} abstraction.
 */
@Configuration
class GeminiRestClientConfig {

  // Built explicitly rather than relying on Spring Boot's RestClientAutoConfiguration to expose
  // a RestClient.Builder bean — not reliably present in this application's autoconfiguration set
  // (confirmed by a real context-startup failure during this round's testing), and a plain
  // RestClient.builder() call needs nothing that autoconfiguration would otherwise add.
  @Bean
  RestClient geminiRestClient(AvalProperties properties) {
    long timeoutMs =
        properties.gemini() != null && properties.gemini().timeoutMs() > 0
            ? properties.gemini().timeoutMs()
            : 15_000;
    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
    factory.setConnectTimeout(Duration.ofMillis(timeoutMs));
    factory.setReadTimeout(Duration.ofMillis(timeoutMs));
    return RestClient.builder().requestFactory(factory).build();
  }
}
