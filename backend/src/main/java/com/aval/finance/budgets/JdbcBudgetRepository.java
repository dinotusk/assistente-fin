package com.aval.finance.budgets;

import com.aval.finance.Money;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcBudgetRepository implements BudgetRepository {

  private final JdbcClient jdbcClient;

  JdbcBudgetRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  @Override
  public Map<UUID, Money> findByHouseholdAndMonth(UUID householdId, UUID monthId) {
    return jdbcClient
        .sql("select profile_id, amount from profile_budgets where household_id = :householdId and month_id = :monthId")
        .param("householdId", householdId)
        .param("monthId", monthId)
        .query((rs, rowNum) -> Map.entry(UUID.fromString(rs.getString("profile_id")), Money.of(rs.getBigDecimal("amount"))))
        .list()
        .stream()
        .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
  }
}
