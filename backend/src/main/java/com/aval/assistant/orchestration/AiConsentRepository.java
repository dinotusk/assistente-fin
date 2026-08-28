package com.aval.assistant.orchestration;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Reads {@code ai_consents} directly — the same table the V0 PWA's {@code gemini-chat.ts} route
 * checks via a Supabase service-role client. This backend's Postgres connection already reads
 * tenancy tables directly with an equivalent, service-role-class credential (see
 * {@code HouseholdAccessService}/ADR-004 addendum), so reading this table the same way is not a
 * new trust boundary — no RLS/RPC needed for a plain, parameterized SELECT.
 *
 * <p>Clients never write consent through this backend this round — {@code accept_ai_consent()}/
 * {@code revoke_ai_consent()} stay exactly where the PWA already calls them (Supabase RPC,
 * {@code auth.uid()}-scoped). This repository is read-only by design.
 */
@Repository
class AiConsentRepository {

  private final JdbcClient jdbcClient;

  AiConsentRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  record ConsentRow(int consentVersion, OffsetDateTime acceptedAt, OffsetDateTime revokedAt) {}

  Optional<ConsentRow> findByUserId(String userId) {
    return jdbcClient
        .sql("select consent_version, accepted_at, revoked_at from ai_consents where user_id = :userId")
        .param("userId", UUID.fromString(userId))
        .query(AiConsentRepository::mapRow)
        .optional();
  }

  private static ConsentRow mapRow(ResultSet rs, int rowNum) throws SQLException {
    OffsetDateTime acceptedAt = rs.getObject("accepted_at", OffsetDateTime.class);
    OffsetDateTime revokedAt = rs.getObject("revoked_at", OffsetDateTime.class);
    return new ConsentRow(rs.getInt("consent_version"), acceptedAt, revokedAt);
  }
}
