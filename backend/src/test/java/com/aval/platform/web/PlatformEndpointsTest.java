package com.aval.platform.web;

import static org.hamcrest.Matchers.is;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;

/**
 * End-to-end proof (real Spring context + MockMvc, no real network/JWKS
 * call needed — see {@link com.aval.platform.config.SecurityConfig}) that
 * the two P1 endpoints, security, CORS, and correlation IDs behave exactly
 * as specified. A valid token is simulated with Spring Security Test's
 * {@code jwt()} post-processor (Fase 24 — never calls the real Supabase
 * JWKS in tests); an invalid one is a genuinely malformed bearer string,
 * which Nimbus rejects at parse time, before any network access.
 */
@SpringBootTest
@AutoConfigureMockMvc
class PlatformEndpointsTest {

  @Autowired private MockMvc mockMvc;

  @Test
  void healthIsPublicAndReturnsOk() throws Exception {
    mockMvc
        .perform(get("/api/v1/health"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status", is("ok")))
        .andExpect(header().exists(RequestIdFilter.HEADER_NAME));
  }

  @Test
  void meWithoutTokenIsRejected() throws Exception {
    mockMvc
        .perform(get("/api/v1/me"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.type", is("AUTHENTICATION_REQUIRED")))
        .andExpect(jsonPath("$.requestId").exists());
  }

  @Test
  void meWithMalformedBearerTokenIsRejected() throws Exception {
    mockMvc
        .perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, "Bearer not-a-real-jwt"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.type", is("AUTHENTICATION_REQUIRED")));
  }

  @Test
  void meWithValidTokenReturnsTheCallersOwnIdentity() throws Exception {
    mockMvc
        .perform(
            get("/api/v1/me")
                .with(
                    jwt()
                        .jwt(
                            builder ->
                                builder
                                    .subject("11111111-1111-1111-1111-111111111111")
                                    .claim("email", "user@example.com"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.authenticated", is(true)))
        .andExpect(jsonPath("$.userId", is("11111111-1111-1111-1111-111111111111")))
        .andExpect(jsonPath("$.email", is("user@example.com")));
  }

  @Test
  void incomingRequestIdIsEchoedBackUnchanged() throws Exception {
    mockMvc
        .perform(get("/api/v1/health").header(RequestIdFilter.HEADER_NAME, "test-request-id-123"))
        .andExpect(status().isOk())
        .andExpect(header().string(RequestIdFilter.HEADER_NAME, "test-request-id-123"));
  }

  @Test
  void invalidIncomingRequestIdIsReplacedRatherThanTrusted() throws Exception {
    mockMvc
        .perform(get("/api/v1/health").header(RequestIdFilter.HEADER_NAME, "has spaces / slashes"))
        .andExpect(status().isOk())
        .andExpect(
            result -> {
              String returned = result.getResponse().getHeader(RequestIdFilter.HEADER_NAME);
              org.junit.jupiter.api.Assertions.assertNotEquals("has spaces / slashes", returned);
            });
  }

  @Test
  void corsAllowsTheConfiguredLocalOrigin() throws Exception {
    // Matches application.yml's default aval.cors.allowed-origins in a test run
    // with no CORS_ALLOWED_ORIGINS env var set.
    mockMvc
        .perform(
            options("/api/v1/health")
                .header(HttpHeaders.ORIGIN, "http://localhost:8080")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
        .andExpect(status().isOk())
        .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:8080"));
  }

  @Test
  void corsRejectsAnUnlistedOrigin() throws Exception {
    mockMvc
        .perform(
            options("/api/v1/health")
                .header(HttpHeaders.ORIGIN, "https://not-an-allowed-origin.example")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
        .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
  }

  @Test
  void unexposedActuatorEndpointIsNotReachable() throws Exception {
    // Only "health" is in management.endpoints.web.exposure.include by
    // default (application.yml) — anything else must not be mapped at all.
    // Authenticated on purpose: an anonymous request would already be
    // rejected with 401 by the security filter chain before Spring MVC ever
    // gets to resolve (or fail to resolve) a handler, which would prove
    // nothing about whether the endpoint itself is mapped.
    mockMvc.perform(get("/actuator/env").with(jwt())).andExpect(status().isNotFound());
  }

  @Test
  void errorResponsesNeverLeakAStackTraceOrExceptionClassName() throws Exception {
    String body =
        mockMvc
            .perform(get("/api/v1/me"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    org.junit.jupiter.api.Assertions.assertFalse(body.contains("Exception"));
    org.junit.jupiter.api.Assertions.assertFalse(body.contains("\tat "));
    org.junit.jupiter.api.Assertions.assertFalse(body.toLowerCase().contains("stacktrace"));
  }
}
