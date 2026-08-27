# Flyway migrations — intentionally empty

This directory is wired into Flyway's `locations` config but holds no
migration files yet, and `spring.flyway.enabled` defaults to `false` (see
`application.yml`).

The existing Supabase/PostgreSQL schema was created through Supabase's own
migration history (`supabase/migrations/` in the frontend project), not
Flyway. Turning Flyway on against that database without first establishing
an explicit baseline (`flyway baseline`) would either fail outright or
attempt to replay schema-creation SQL that already exists.

Before adding the first real migration file here or flipping
`spring.flyway.enabled` to `true` against a real environment:

1. decide and document the baseline version/checkpoint the existing schema
   represents;
2. run `flyway baseline` explicitly and deliberately against that specific
   database, once, with a human watching;
3. only then start adding `V<n>__description.sql` files for genuinely new
   changes going forward.

See `docs/architecture/ADR-002-spring-boot-supabase.md`.

Test-only migrations (used exclusively by the Testcontainers integration
tests, against a disposable container) live separately in
`backend/src/test/resources/db/migration` — never here.
