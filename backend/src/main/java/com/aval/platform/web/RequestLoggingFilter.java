package com.aval.platform.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * One structured line per completed request: timestamp (from the logger
 * itself), route, method, status, duration, and — when authenticated — the
 * Supabase user id (the JWT {@code sub} claim; an internal identifier, never
 * the token itself). Never logs the Authorization header, the JWT, or any
 * request/response body, so it can never leak financial data or secrets —
 * see docs/architecture and backend/README.md "Logging" for the full
 * redaction rule this filter is built to satisfy.
 *
 * <p>Deliberately NOT a {@code @Component}: it is registered explicitly by
 * {@link com.aval.platform.config.SecurityConfig} at a specific position in
 * the security filter chain (after authentication resolves, so {@link
 * SecurityContextHolder} is populated) — annotating it as a component too
 * would make Spring Boot register it a second time as a plain servlet
 * filter outside that chain.
 */
public class RequestLoggingFilter extends OncePerRequestFilter {

  private static final Logger log = LoggerFactory.getLogger("com.aval.access");

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    long startedAt = System.currentTimeMillis();
    try {
      filterChain.doFilter(request, response);
    } finally {
      long durationMs = System.currentTimeMillis() - startedAt;
      log.info(
          "method={} route={} status={} durationMs={} userId={}",
          request.getMethod(),
          request.getRequestURI(),
          response.getStatus(),
          durationMs,
          currentUserId());
    }
  }

  private String currentUserId() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication != null && authentication.getPrincipal() instanceof Jwt jwt) {
      return jwt.getSubject();
    }
    return "anonymous";
  }
}
