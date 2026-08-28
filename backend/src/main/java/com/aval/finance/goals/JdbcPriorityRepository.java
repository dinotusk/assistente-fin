package com.aval.finance.goals;

import com.aval.finance.Money;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcPriorityRepository implements PriorityRepository {

  private final JdbcClient jdbcClient;

  JdbcPriorityRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  @Override
  public List<Priority> findByHouseholdAndMonth(UUID householdId, UUID monthId) {
    return jdbcClient
        .sql(
            """
            select id, household_id, month_id, profile_id, description, target_amount,
                   saved_amount, priority, status
            from priorities
            where household_id = :householdId and month_id = :monthId
            """)
        .param("householdId", householdId)
        .param("monthId", monthId)
        .query(JdbcPriorityRepository::mapRow)
        .list();
  }

  private static Priority mapRow(ResultSet rs, int rowNum) throws SQLException {
    return new Priority(
        UUID.fromString(rs.getString("id")),
        UUID.fromString(rs.getString("household_id")),
        UUID.fromString(rs.getString("month_id")),
        UUID.fromString(rs.getString("profile_id")),
        rs.getString("description"),
        Money.of(rs.getBigDecimal("target_amount")),
        Money.of(rs.getBigDecimal("saved_amount")),
        rs.getInt("priority"),
        PriorityStatus.fromDb(rs.getString("status")));
  }
}
