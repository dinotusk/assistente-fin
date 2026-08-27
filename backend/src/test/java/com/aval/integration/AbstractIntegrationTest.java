package com.aval.integration;

import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Base class for tests that need a real PostgreSQL — never the Supabase
 * production database (Fase 22/35: zero writes/reads against real data
 * from tests). {@code @ServiceConnection} (Spring Boot 4's native
 * Testcontainers integration) wires the container's JDBC URL/username/
 * password into {@code spring.datasource.*} automatically; no manual
 * {@code @DynamicPropertySource} plumbing needed.
 *
 * <p>The "test" profile (application-test.yml) turns Flyway on against
 * this disposable container only, using the test-only migration set in
 * src/test/resources/db/migration — proving the Flyway wiring itself works
 * without going anywhere near the real, untouched Supabase schema.
 *
 * <p><b>Singleton Container pattern (P2-FINANCIAL-DOMAIN)</b> — deliberately NOT
 * {@code @Testcontainers}/{@code @Container}: that combination starts/stops the
 * container once PER TEST CLASS, but Spring's test-context cache reuses the SAME
 * {@code ApplicationContext}/DataSource across two classes with identical
 * {@code @SpringBootTest} config regardless. Once a second class extending this one
 * existed ({@code FinancialSummaryIntegrationTest}, alongside P1's {@code
 * PostgresIntegrationTest}), that mismatch surfaced for real: class 2's {@code
 * @Container} restart spun up a brand-new container on a new port, while Spring kept
 * serving the cached DataSource still wired to class 1's now-stopped container —
 * every connection attempt then timed out (Hikari pool stuck at
 * total=0/active=0/idle=0). Starting the container exactly once, eagerly, in a static
 * initializer — and never calling {@code stop()} — is the fix Testcontainers' own
 * docs recommend for this exact multi-class scenario; Ryuk still reaps it at JVM exit.
 *
 * <p>Requires Docker. If Docker isn't available wherever this suite runs,
 * these tests fail at container startup, not silently pass — see
 * backend/README.md "Testcontainers" for how to tell that failure mode
 * apart from a genuine regression.
 */
@ActiveProfiles("test")
public abstract class AbstractIntegrationTest {

  @ServiceConnection
  static final PostgreSQLContainer POSTGRES =
      new PostgreSQLContainer(DockerImageName.parse("postgres:16-alpine"));

  static {
    POSTGRES.start();
  }
}
