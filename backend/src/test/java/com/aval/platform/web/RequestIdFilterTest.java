package com.aval.platform.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

class RequestIdFilterTest {

  private final RequestIdFilter filter = new RequestIdFilter();

  @Test
  void reusesAValidIncomingRequestId() throws Exception {
    HttpServletRequest request = mock(HttpServletRequest.class);
    HttpServletResponse response = mock(HttpServletResponse.class);
    FilterChain chain = mock(FilterChain.class);
    org.mockito.Mockito.when(request.getHeader(RequestIdFilter.HEADER_NAME)).thenReturn("abc-123");

    filter.doFilterInternal(request, response, chain);

    verify(response).setHeader(RequestIdFilter.HEADER_NAME, "abc-123");
  }

  @Test
  void generatesAFreshIdWhenNoneIsSupplied() throws Exception {
    HttpServletRequest request = mock(HttpServletRequest.class);
    HttpServletResponse response = mock(HttpServletResponse.class);
    FilterChain chain = mock(FilterChain.class);
    org.mockito.Mockito.when(request.getHeader(RequestIdFilter.HEADER_NAME)).thenReturn(null);

    filter.doFilterInternal(request, response, chain);

    verify(response).setHeader(org.mockito.ArgumentMatchers.eq(RequestIdFilter.HEADER_NAME), any());
  }

  @Test
  void rejectsAMalformedIncomingHeaderAndGeneratesItsOwn() throws Exception {
    HttpServletRequest request = mock(HttpServletRequest.class);
    HttpServletResponse response = mock(HttpServletResponse.class);
    FilterChain chain = mock(FilterChain.class);
    org.mockito.Mockito.when(request.getHeader(RequestIdFilter.HEADER_NAME))
        .thenReturn("has spaces / slashes");

    filter.doFilterInternal(request, response, chain);

    verify(response)
        .setHeader(
            org.mockito.ArgumentMatchers.eq(RequestIdFilter.HEADER_NAME),
            org.mockito.ArgumentMatchers.argThat(value -> !"has spaces / slashes".equals(value)));
  }

  @Test
  void putsTheRequestIdInMdcOnlyForTheDurationOfTheRequest() throws Exception {
    HttpServletRequest request = mock(HttpServletRequest.class);
    HttpServletResponse response = mock(HttpServletResponse.class);
    FilterChain chain = mock(FilterChain.class);
    org.mockito.Mockito.when(request.getHeader(RequestIdFilter.HEADER_NAME)).thenReturn("mdc-test-id");

    doAnswer(
            invocation -> {
              assertThat(MDC.get(RequestIdFilter.MDC_KEY)).isEqualTo("mdc-test-id");
              return null;
            })
        .when(chain)
        .doFilter(any(), any());

    filter.doFilterInternal(request, response, chain);

    assertThat(MDC.get(RequestIdFilter.MDC_KEY)).isNull();
  }
}
