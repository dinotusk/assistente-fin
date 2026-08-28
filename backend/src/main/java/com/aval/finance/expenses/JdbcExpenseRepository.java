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

  @Override
  public List<FinancialEntry> search(ExpenseSearchCriteria criteria) {
    // Every filter below is appended as a parameterized clause, never string-concatenated into
    // the SQL text itself — the WHERE clause's shape changes per request, but every value is
    // always bound, exactly like the fixed-shape queries elsewhere in this package.
    StringBuilder filters = new StringBuilder();
    if (criteria.ownerProfileId().isPresent()) filters.append(" and owner_profile_id = :ownerProfileId");
    if (criteria.category().isPresent()) filters.append(" and category = :category");
    if (criteria.status().isPresent()) filters.append(" and status = :status");
    if (criteria.entryType().isPresent()) filters.append(" and entry_type = :entryType");

    String sql =
        """
        select id, owner_profile_id, description, entry_type, category, amount, status,
               expense_date, due_date
        from expenses
        where household_id = :householdId and month_id = :monthId
        """
            + filters
            + " order by expense_date desc, id desc limit :limit offset :offset";

    var query =
        jdbcClient
            .sql(sql)
            .param("householdId", criteria.householdId())
            .param("monthId", criteria.monthId())
            .param("limit", criteria.limit() + 1)
            .param("offset", criteria.offset());
    if (criteria.ownerProfileId().isPresent()) query = query.param("ownerProfileId", criteria.ownerProfileId().get());
    if (criteria.category().isPresent()) query = query.param("category", criteria.category().get());
    if (criteria.status().isPresent()) query = query.param("status", toDbStatus(criteria.status().get()));
    if (criteria.entryType().isPresent()) query = query.param("entryType", toDbEntryType(criteria.entryType().get()));

    return query.query(JdbcExpenseRepository::mapRow).list();
  }

  private static String toDbStatus(ExpenseStatus status) {
    return switch (status) {
      case PAID -> "Pago";
      case PENDING -> "A pagar";
    };
  }

  private static String toDbEntryType(EntryType type) {
    return switch (type) {
      case EXPENSE -> "expense";
      case INCOME -> "income";
    };
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
