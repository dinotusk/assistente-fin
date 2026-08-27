package com.aval.platform.errors;

/**
 * One field-level validation failure inside an {@link ApiErrorResponse}'s
 * {@code details} list. {@code field} is null for a non-field (object-level)
 * validation failure.
 */
public record ApiErrorDetail(String field, String message) {}
