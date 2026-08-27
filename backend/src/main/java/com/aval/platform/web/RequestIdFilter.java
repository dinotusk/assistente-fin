package com.aval.platform.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Assigns every request a correlation ID: reuses an incoming {@code
 * X-Request-ID} header if present (so a future gateway/mobile client can
 * thread its own ID through), otherwise generates one. The ID is placed in
 * the response header, in the logging MDC (see {@link
 * com.aval.platform.errors.GlobalExceptionHandler} and application.yml's
 * logging pattern), and is what error responses echo back — this is what
 * lets a user report "request X failed" and have it be traceable end to
 * end, including in the future through Open Finance/webhook/IA calls.
 *
 * <p>Runs first in the filter chain so every downstream filter/handler
 * (including Spring Security's) can rely on the MDC value already being set.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

  public static final String HEADER_NAME = "X-Request-ID";
  public static final String MDC_KEY = "requestId";

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    String incoming = request.getHeader(HEADER_NAME);
    String requestId = isValid(incoming) ? incoming : UUID.randomUUID().toString();

    MDC.put(MDC_KEY, requestId);
    response.setHeader(HEADER_NAME, requestId);
    try {
      filterChain.doFilter(request, response);
    } finally {
      MDC.remove(MDC_KEY);
    }
  }

  /** Rejects anything that isn't a short, plain token — an incoming header is untrusted input. */
  private boolean isValid(String value) {
    return value != null && !value.isBlank() && value.length() <= 100 && value.matches("[\\w-]+");
  }
}
