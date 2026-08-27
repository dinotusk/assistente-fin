package com.aval.platform.web;

import org.slf4j.MDC;

/** Reads the correlation ID {@link RequestIdFilter} placed in the logging MDC for this request. */
public final class RequestContext {

  private RequestContext() {}

  public static String currentRequestId() {
    String value = MDC.get(RequestIdFilter.MDC_KEY);
    return value != null ? value : "unknown";
  }
}
