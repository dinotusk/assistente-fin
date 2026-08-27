# ADR-002 — Spring Boot + Supabase (Supabase stays; no new database)

**Status:** Accepted — P1-SPRING-BOOT-FOUNDATION

## Context

The PWA already runs on Supabase (PostgreSQL + Auth). The roadmap calls for
a Spring Boot backend to host the growing domain/API/integration surface
without a big-bang rewrite or a second data store.

## Decision

- **Spring Boot 4.1.0** on **Java 25 (LTS)**, Maven build, in `backend/` at
  the repo root, independent of the frontend's build/package manager.
- **Supabase/PostgreSQL is not replaced.** The Spring backend connects to
  the same PostgreSQL instance the PWA already uses. Supabase continues to
  own: PostgreSQL hosting, Supabase Auth (issuing the JWTs the backend
  validates — see ADR-003), and storage where applicable.
- **No new database, no data migration this round.** The existing schema
  (created through Supabase's own migration history) is not touched.

## Why Spring Boot 4.x, not 3.5.x

Spring Boot 3.5.x reached end-of-life on 2026-06-30. For a brand-new
foundation meant to last years, 4.x (built on Spring Framework 7 + Jakarta
EE 11, LTS support through at least 2030) is the only responsibly
supportable choice — not a stylistic preference for "the new thing."
Pinned to **4.1.0** (GA 2026-06-10, confirmed resolvable on Maven Central)
rather than the newer 4.1.1 patch, which this project could not
independently confirm was resolvable from the environment this scaffold
was built in — bump it once a real `./mvnw verify` has run.

## Why Java 25, not 21

The task's own instructions allow "Java 21 LTS ou superior." Java 25
became the current LTS in September 2025 and is what Spring Boot 4
targets going forward; there is no compatibility reason to pin to the
older LTS for a greenfield project starting now.

## Why JDBC, not JPA, this round

There is no domain entity to map yet — P1 ships no financial endpoints
(see ADR-005). Pulling in Hibernate/JPA with zero `@Entity` classes would
be unused weight and a form of the "enterprise theater" the roadmap warns
against. `spring-boot-starter-jdbc` is enough to prove real connectivity
(see `PostgresIntegrationTest`). JPA is a decision for P2-FINANCIAL-DOMAIN,
once there is a real entity to map — and even then, plain JDBC/jOOQ may
turn out to be the better fit; this ADR doesn't prejudge that.

## Why Flyway is configured but disabled

The existing schema was created through Supabase's own migration history,
not Flyway's. Enabling Flyway against that database without an explicit,
deliberate baseline step would either fail outright or attempt to replay
schema-creation SQL that already exists. See
`backend/src/main/resources/db/migration/README.md` for the baseline
procedure required before this ever gets flipped on against a real
environment. Flyway *is* exercised for real in the Testcontainers
integration test, against a disposable throwaway container only.

## Consequences

- The backend cannot yet serve any financial data — it is a foundation,
  not a working substitute for the PWA's domain logic.
- A future baseline step for Flyway needs a human decision and a specific,
  reviewed migration event — it cannot be automated safely without first
  understanding exactly what "V1" of the real schema should represent.
