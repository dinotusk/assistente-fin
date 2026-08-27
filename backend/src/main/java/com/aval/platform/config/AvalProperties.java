package com.aval.platform.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Binds the {@code aval.*} configuration namespace — see application.yml. */
@ConfigurationProperties(prefix = "aval")
public record AvalProperties(Cors cors, Supabase supabase) {

  /** {@code allowedOrigins} is a plain list — Spring Boot relaxed binding splits the
   *  comma-separated {@code CORS_ALLOWED_ORIGINS} env var into it automatically. */
  public record Cors(List<String> allowedOrigins) {}

  public record Supabase(String jwtAudience) {}
}
