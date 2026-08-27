package com.aval.household;

import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcHouseholdMembershipRepository implements HouseholdMembershipRepository {

  private final JdbcClient jdbcClient;

  JdbcHouseholdMembershipRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  @Override
  public List<UUID> findHouseholdIdsForUser(String userId) {
    return jdbcClient
        .sql("select household_id from household_members where user_id = :userId")
        .param("userId", UUID.fromString(userId))
        .query(UUID.class)
        .list();
  }
}
