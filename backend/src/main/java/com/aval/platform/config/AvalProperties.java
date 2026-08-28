package com.aval.platform.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Binds the {@code aval.*} configuration namespace — see application.yml. */
@ConfigurationProperties(prefix = "aval")
public record AvalProperties(Cors cors, Supabase supabase, Gemini gemini) {

  /** {@code allowedOrigins} is a plain list — Spring Boot relaxed binding splits the
   *  comma-separated {@code CORS_ALLOWED_ORIGINS} env var into it automatically. */
  public record Cors(List<String> allowedOrigins) {}

  public record Supabase(String jwtAudience) {}

  /**
   * Same provider, same env var names, same default model the V0 PWA's {@code gemini-chat.ts}
   * already uses (see docs/architecture/assistant-foundation.md "Provider choice") — {@code
   * apiKey} is read lazily by {@code GeminiLlmProvider} only when a request actually needs it,
   * never required for the application context to start (same pattern as {@code SecurityConfig}'s
   * {@code JwtDecoder} bean).
   */
  public record Gemini(String apiKey, String model, long timeoutMs) {}
}
