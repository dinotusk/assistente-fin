package com.aval.assistant.orchestration;

import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * Calls the existing, already-audited {@code check_and_log_ai_rate_limit(user_id, window_seconds,
 * max_requests)} Postgres function — the same one {@code gemini-chat.ts} calls via a Supabase RPC
 * — directly over this backend's JDBC connection. Unlike {@code is_household_member()} (see the
 * ADR-004 addendum), this function takes {@code p_user_id} as an explicit parameter rather than
 * reading {@code auth.uid()} internally, so it has no session-context problem on a direct JDBC
 * connection: it is called exactly as designed, not reimplemented. The function's own advisory
 * lock (see the migration) keeps the check-and-log atomic under concurrent requests — nothing
 * about that concurrency safety is redone in Java.
 *
 * <p>Same window/budget as the PWA: {@value #WINDOW_SECONDS} seconds, {@value #MAX_REQUESTS}
 * requests — one shared budget per user id across both the PWA and this backend, since they log
 * to the same {@code ai_rate_limit_events} table.
 */
@Service
public class AiRateLimiter {

  static final int WINDOW_SECONDS = 5 * 60;
  static final int MAX_REQUESTS = 20;

  private final JdbcClient jdbcClient;

  AiRateLimiter(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  /** @throws ApiException RATE_LIMITED if the user's request budget for this window is exhausted. */
  public void requireWithinLimit(String userId) {
    Boolean allowed =
        jdbcClient
            .sql("select check_and_log_ai_rate_limit(:userId, :windowSeconds, :maxRequests)")
            .param("userId", UUID.fromString(userId))
            .param("windowSeconds", WINDOW_SECONDS)
            .param("maxRequests", MAX_REQUESTS)
            .query(Boolean.class)
            .single();
    if (!Boolean.TRUE.equals(allowed)) {
      throw new ApiException(
          ApiErrorType.RATE_LIMITED, "Muitas perguntas em pouco tempo. Aguarde alguns minutos e tente novamente.");
    }
  }
}
