-- Test-only migration, applied exclusively to the disposable Testcontainers
-- PostgreSQL instance (see AbstractIntegrationTest). Proves Flyway itself
-- runs correctly; has nothing to do with — and is never applied against —
-- the real Supabase schema. See backend/src/main/resources/db/migration/README.md.
create table platform_healthcheck (
  id integer primary key,
  note text not null
);

insert into platform_healthcheck (id, note) values (1, 'flyway wiring proven by integration test');
