package com.aval.platform.config;

import com.aval.platform.errors.ApiErrorResponse;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.web.RequestContext;
import com.aval.platform.web.RequestLoggingFilter;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Security posture for the whole API in one place — see
 * docs/architecture/ADR-003-supabase-auth-jwt.md and ADR-004 for the
 * reasoning behind each decision below.
 *
 * <ul>
 *   <li>Stateless: no session, no cookie, CSRF disabled — the API only ever
 *       authenticates via a bearer JWT the frontend already gets from
 *       Supabase Auth, so there is no session-riding CSRF surface to
 *       protect against in the first place.
 *   <li>Every route requires a valid JWT except the two explicitly listed
 *       public ones (health, and Swagger UI outside production).
 *   <li>The default security headers Spring Security applies (HSTS on HTTPS
 *       requests, {@code X-Content-Type-Options: nosniff}, frame options,
 *       cache-control on sensitive responses) are left enabled deliberately
 *       — nothing here disables them.
 * </ul>
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

  private final ObjectMapper objectMapper;
  private final AvalProperties avalProperties;

  public SecurityConfig(ObjectMapper objectMapper, AvalProperties avalProperties) {
    this.objectMapper = objectMapper;
    this.avalProperties = avalProperties;
  }

  @Bean
  public SecurityFilterChain securityFilterChain(HttpSecurity http, JwtDecoder jwtDecoder) throws Exception {
    http.csrf(csrf -> csrf.disable())
        .cors(cors -> cors.configurationSource(corsConfigurationSource()))
        .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            authorize ->
                authorize
                    .requestMatchers(
                        new AntPathRequestMatcher("/api/v1/health"),
                        new AntPathRequestMatcher("/actuator/health"),
                        new AntPathRequestMatcher("/actuator/health/**"))
                    .permitAll()
                    // Swagger UI/OpenAPI JSON are disabled outright in the production
                    // profile (application-production.yml) — permitting the paths
                    // here is harmless when the endpoints don't exist, and avoids
                    // needing a profile-conditional security rule.
                    .requestMatchers(
                        new AntPathRequestMatcher("/swagger-ui.html"),
                        new AntPathRequestMatcher("/swagger-ui/**"),
                        new AntPathRequestMatcher("/v3/api-docs/**"))
                    .permitAll()
                    .anyRequest()
                    .authenticated())
        .oauth2ResourceServer(
            oauth2 ->
                oauth2
                    .jwt(
                        jwt ->
                            jwt.decoder(jwtDecoder)
                                .jwtAuthenticationConverter(jwtAuthenticationConverter()))
                    .authenticationEntryPoint(authenticationEntryPoint())
                    .accessDeniedHandler(accessDeniedHandler()))
        // Positioned after the resource-server filter resolves authentication, so
        // RequestLoggingFilter can read the authenticated principal. See its own
        // Javadoc for why it is a plain instance here instead of a @Component.
        .addFilterAfter(new RequestLoggingFilter(), BearerTokenAuthenticationFilter.class);

    return http.build();
  }

  /**
   * Validates the Supabase-issued JWT's signature (via its JWKS endpoint),
   * issuer, expiry, and audience. Identity is derived exclusively from this
   * — nothing here trusts a client-supplied user id.
   *
   * <p>The default JWKS URL/issuer are syntactically valid placeholders so
   * the application context always starts even without real Supabase
   * environment variables configured — JWKS fetching is lazy (only happens
   * on the first token actually presented, not at bean-construction time).
   * Tests that exercise the protected endpoint override authentication
   * directly with Spring Security Test's {@code jwt()} post-processor
   * instead of relying on this bean at all — see
   * AbstractIntegrationTest/MeControllerTest.
   */
  @Bean
  public JwtDecoder jwtDecoder(
      @Value("${SUPABASE_JWKS_URL:https://example.invalid/.well-known/jwks.json}") String jwksUrl,
      @Value("${SUPABASE_JWT_ISSUER:https://example.invalid/auth/v1}") String issuer) {
    NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(jwksUrl).build();
    decoder.setJwtValidator(
        new DelegatingOAuth2TokenValidator<>(
            JwtValidators.createDefaultWithIssuer(issuer),
            new JwtClaimValidator<String>("aud", this::matchesAudience)));
    return decoder;
  }

  // Assumes Supabase's documented JWT shape: `aud` is a single string
  // ("authenticated"), not a JSON array — true as of Supabase Auth's stable,
  // long-established token format. If that ever changes, this validator
  // needs a JwtClaimValidator<List<String>> instead.
  private boolean matchesAudience(String audienceClaim) {
    return avalProperties.supabase() != null
        && avalProperties.supabase().jwtAudience() != null
        && avalProperties.supabase().jwtAudience().equals(audienceClaim);
  }

  /** No custom scopes/roles come from Supabase today — an empty authority set is correct, not an oversight. */
  private JwtAuthenticationConverter jwtAuthenticationConverter() {
    JwtGrantedAuthoritiesConverter authoritiesConverter = new JwtGrantedAuthoritiesConverter();
    authoritiesConverter.setAuthoritiesClaimName("__unused__");
    authoritiesConverter.setAuthorityPrefix("");
    JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
    converter.setJwtGrantedAuthoritiesConverter(authoritiesConverter);
    return converter;
  }

  private CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration configuration = new CorsConfiguration();
    List<String> allowedOrigins =
        avalProperties.cors() != null && avalProperties.cors().allowedOrigins() != null
            ? avalProperties.cors().allowedOrigins()
            : List.of();
    // Explicit origin list only — never "*" together with allowCredentials(true).
    configuration.setAllowedOrigins(allowedOrigins);
    configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Request-ID"));
    configuration.setExposedHeaders(List.of("X-Request-ID"));
    configuration.setAllowCredentials(true);
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", configuration);
    return source;
  }

  /** 401s from the security chain itself (missing/invalid token) — same {@link ApiErrorResponse} shape as everything else. */
  private AuthenticationEntryPoint authenticationEntryPoint() {
    return (request, response, authException) ->
        writeError(
            response, HttpStatus.UNAUTHORIZED, ApiErrorType.AUTHENTICATION_REQUIRED, "Autenticação necessária.");
  }

  /** 403s from the security chain itself — reshaped into the same {@link ApiErrorResponse} every other error uses. */
  private AccessDeniedHandler accessDeniedHandler() {
    return (request, response, accessDeniedException) -> {
      if (response.isCommitted()) return;
      writeError(response, HttpStatus.FORBIDDEN, ApiErrorType.ACCESS_DENIED, "Acesso negado.");
    };
  }

  private void writeError(HttpServletResponse response, HttpStatus status, ApiErrorType type, String message)
      throws IOException {
    response.setStatus(status.value());
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    ApiErrorResponse body = new ApiErrorResponse(type, message, RequestContext.currentRequestId());
    response.getWriter().write(objectMapper.writeValueAsString(body));
  }
}
