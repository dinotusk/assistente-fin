package com.aval.household;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcFinancialProfileRepository implements FinancialProfileRepository {

  private final JdbcClient jdbcClient;

  JdbcFinancialProfileRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  @Override
  public List<FinancialProfile> findActiveByHousehold(UUID householdId) {
    return jdbcClient
        .sql(
            """
            select id, household_id, name, kind, sort_order, active
            from financial_profiles
            where household_id = :householdId and active = true
            order by sort_order
            """)
        .param("householdId", householdId)
        .query(JdbcFinancialProfileRepository::mapRow)
        .list();
  }

  @Override
  public Optional<FinancialProfile> findByIdAndHousehold(UUID profileId, UUID householdId) {
    return jdbcClient
        .sql(
            """
            select id, household_id, name, kind, sort_order, active
            from financial_profiles
            where id = :profileId and household_id = :householdId
            """)
        .param("profileId", profileId)
        .param("householdId", householdId)
        .query(JdbcFinancialProfileRepository::mapRow)
        .optional();
  }

  private static FinancialProfile mapRow(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
    return new FinancialProfile(
        UUID.fromString(rs.getString("id")),
        UUID.fromString(rs.getString("household_id")),
        rs.getString("name"),
        ProfileKind.fromDb(rs.getString("kind")),
        rs.getInt("sort_order"),
        rs.getBoolean("active"));
  }
}
