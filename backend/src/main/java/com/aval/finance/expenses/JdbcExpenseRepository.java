package com.aval.finance.expenses;

import com.aval.finance.Money;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcExpenseRepository implements ExpenseRepository {

  private final JdbcClient jdbcClient;

  JdbcExpenseRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  @Override
  public List<FinancialEntry> findByHouseholdAndMonth(UUID householdId, UUID monthId) {
    return jdbcClient
        .sql(
            """
            select id, owner_profile_id, description, entry_type, category, amount, status,
                   expense_date, due_date
            from expenses
            where household_id = :householdId and month_id = :monthId
            """)
        .param("householdId", householdId)
        .param("monthId", monthId)
        .query(JdbcExpenseRepository::mapRow)
        .list();
  }

  private static FinancialEntry mapRow(ResultSet rs, int rowNum) throws SQLException {
    return new FinancialEntry(
        UUID.fromString(rs.getString("id")),
        UUID.fromString(rs.getString("owner_profile_id")),
        rs.getString("description"),
        EntryType.fromDb(rs.getString("entry_type")),
        rs.getString("category"),
        Money.of(rs.getBigDecimal("amount")),
        ExpenseStatus.fromDb(rs.getString("status")),
        rs.getDate("expense_date").toLocalDate(),
        rs.getDate("due_date") != null ? rs.getDate("due_date").toLocalDate() : null);
  }
}
