package com.aval.integration;

import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
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
 * <p>Requires Docker. If Docker isn't available wherever this suite runs,
 * these tests fail at container startup, not silently pass — see
 * backend/README.md "Testcontainers" for how to tell that failure mode
 * apart from a genuine regression.
 */
@Testcontainers
@ActiveProfiles("test")
public abstract class AbstractIntegrationTest {

  @Container
  @ServiceConnection
  static final PostgreSQLContainer POSTGRES =
      new PostgreSQLContainer(DockerImageName.parse("postgres:16-alpine"));
}
