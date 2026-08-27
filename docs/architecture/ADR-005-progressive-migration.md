# ADR-005 — Progressive migration from the PWA, no big-bang rewrite

**Status:** Accepted — P1-SPRING-BOOT-FOUNDATION

## Context

The PWA is a working, validated product (P0-FINANCIAL-TRUTH found no
unambiguous financial bugs). The roadmap wants a Spring Boot backend
eventually hosting the financial domain, AI orchestration, and Open
Finance — without breaking or replacing the working product mid-flight.

## Decision

Migrate feature by feature, never all at once:

1. **P1 (this round):** Spring Boot foundation only — health/auth
   diagnostics, no business logic, frontend behavior unchanged. The PWA
   keeps 100% of its current responsibilities.
2. **P2 (next, not yet started):** translate P0's proven invariants from
   `calc.ts` into a Java financial domain, with parity tests against the
   TypeScript behavior — not a "close enough" reimplementation. First real
   financial endpoint ships here.
3. **During the transition:** the PWA continues talking to Supabase
   directly for everything not yet migrated, and can start calling specific
   Spring endpoints only once they exist and are proven — this round adds
   no such wiring.
4. **Mobile (Expo, later):** only begins once the API surface migrated so
   far is stable enough that a second client isn't chasing a moving target.
   Both PWA and Expo end up calling the same Spring API; the PWA is never
   discarded, only optionally reduced in scope over time.

## Explicit non-goals for P1

- No frontend code calls the new backend yet.
- No financial rule is migrated or reimplemented in Java yet.
- No data is migrated — same single Supabase/PostgreSQL database throughout.

## Consequences

- Two codebases (TypeScript `calc.ts` and, starting P2, a Java equivalent)
  will coexist for a while. P2's parity tests exist specifically to prevent
  them silently drifting apart — see P0-FINANCIAL-TRUTH's invariant suite,
  which becomes the parity contract.
- The V0 tag/branch (`aval-v0` / `archive/aval-v0`, both pinned to the
  commit before this backend existed) is the permanent, recoverable
  snapshot of "the product before V1 began" — see the P1 delivery report
  for the exact commit.
