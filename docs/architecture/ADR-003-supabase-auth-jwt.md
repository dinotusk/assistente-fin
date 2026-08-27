# ADR-003 — Supabase Auth: JWT validation only, never a parallel login system

**Status:** Accepted — P1-SPRING-BOOT-FOUNDATION

## Context

The PWA authenticates through Supabase Auth (email/password, Google OAuth).
The Spring backend needs to recognize the same authenticated users without
duplicating identity.

## Decision

The frontend keeps authenticating exclusively through Supabase Auth, exactly
as it does today. The Spring backend is configured as an **OAuth2 Resource
Server**, validating the JWT Supabase already issues:

- signature, via Supabase's JWKS endpoint (`SUPABASE_JWKS_URL`);
- issuer (`SUPABASE_JWT_ISSUER`);
- expiry (standard JWT `exp` claim, via Spring Security's default validator);
- audience (`SUPABASE_JWT_AUDIENCE`, typically `authenticated`).

Identity — `AuthenticatedUser` (`platform.auth`) — is derived exclusively
from the validated token's `sub` (Supabase's stable `auth.users.id`) and
`email` claims. See `GET /api/v1/me`.

## Explicitly rejected alternatives

- **Sending the user's password to Spring.** Never — Supabase Auth already
  owns credential verification; duplicating it would mean a second place
  passwords could leak from.
- **A parallel Spring-native login/session system.** Would create two
  sources of identity truth and two places a user's account could get out
  of sync.
- **Trusting a client-supplied user id** (a request body field, a query
  parameter, a custom header). Every endpoint's notion of "who is calling"
  comes from the validated JWT's `sub` claim, never from anything the
  request body/query string says.
- **Storing the access token in the database.** The backend validates
  tokens per-request; it never persists one.

## Testing without calling real Supabase

Tests never hit a real Supabase JWKS endpoint. Spring Security Test's
`jwt()` `MockMvc` post-processor injects an already-authenticated principal
directly, bypassing the real `JwtDecoder` bean entirely for that request —
see `PlatformEndpointsTest`. Production continues using the real
JWKS-backed decoder.

## Consequences

- The backend has a hard dependency on Supabase Auth staying the identity
  provider. Swapping identity providers later would mean swapping the JWT
  issuer/JWKS source, not rearchitecting this module.
- No refresh-token handling lives in Spring — that stays entirely on the
  frontend/Supabase client SDK side, unchanged.
