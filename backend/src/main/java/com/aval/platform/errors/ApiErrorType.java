package com.aval.platform.errors;

/**
 * Closed set of error categories the API can return. Every error response
 * carries exactly one of these — callers (frontend, future mobile client,
 * future assistant tools) can branch on this instead of parsing messages or
 * HTTP status codes alone.
 */
public enum ApiErrorType {
  VALIDATION_ERROR,
  AUTHENTICATION_REQUIRED,
  ACCESS_DENIED,
  RESOURCE_NOT_FOUND,
  CONFLICT,
  RATE_LIMITED,
  EXTERNAL_SERVICE_ERROR,
  INTERNAL_ERROR
}
