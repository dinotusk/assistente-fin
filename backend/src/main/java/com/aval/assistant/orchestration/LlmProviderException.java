package com.aval.assistant.orchestration;

/**
 * Any {@link LlmProvider} failure — timeout, transport error, non-2xx response, unparseable body,
 * safety block. {@link AssistantOrchestrator} catches this and converts it to the API's standard
 * {@code EXTERNAL_SERVICE_ERROR} shape (never a raw stack trace or provider response body reaching
 * the client — see {@code AssistantController}).
 */
public class LlmProviderException extends RuntimeException {

  public LlmProviderException(String message) {
    super(message);
  }

  public LlmProviderException(String message, Throwable cause) {
    super(message, cause);
  }
}
