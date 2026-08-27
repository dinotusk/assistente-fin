package com.aval.platform.auth;

import org.springframework.security.oauth2.jwt.Jwt;

/**
 * The caller's identity, derived exclusively from a validated Supabase JWT
 * — never from anything the client sends unauthenticated (a request body
 * field, a query parameter, a header). See
 * docs/architecture/ADR-003-supabase-auth-jwt.md.
 *
 * @param id the JWT {@code sub} claim — Supabase's stable auth.users id.
 * @param email the JWT {@code email} claim, when present. Supabase always
 *     includes it for password/OAuth sign-ins; treat as nullable regardless.
 */
public record AuthenticatedUser(String id, String email) {

  public static AuthenticatedUser fromJwt(Jwt jwt) {
    return new AuthenticatedUser(jwt.getSubject(), jwt.getClaimAsString("email"));
  }
}
