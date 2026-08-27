package com.aval.integration;

import static org.assertj.core.api.Assertions.assertThat;

import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Proves the application actually connects to a real PostgreSQL and that
 * Flyway's configuration is correct — Spring context, DataSource, and
 * migrations, end to end. See {@link AbstractIntegrationTest} for why this
 * container is always disposable and never the real Supabase database.
 */
@SpringBootTest
class PostgresIntegrationTest extends AbstractIntegrationTest {

  @Autowired private DataSource dataSource;

  @Test
  void connectsToTheRealPostgresContainer() throws Exception {
    try (var connection = dataSource.getConnection()) {
      assertThat(connection.isValid(2)).isTrue();
    }
  }

  @Test
  void flywayMigrationRanAgainstTheDisposableContainer() {
    JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
    String note =
        jdbcTemplate.queryForObject(
            "select note from platform_healthcheck where id = 1", String.class);
    assertThat(note).isEqualTo("flyway wiring proven by integration test");
  }
}
