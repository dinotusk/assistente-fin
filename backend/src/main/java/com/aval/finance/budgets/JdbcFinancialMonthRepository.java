package com.aval.finance.budgets;

import com.aval.finance.Money;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.YearMonth;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcFinancialMonthRepository implements FinancialMonthRepository {

  private final JdbcClient jdbcClient;

  JdbcFinancialMonthRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  @Override
  public Optional<FinancialMonth> findByHouseholdAndPeriod(UUID householdId, YearMonth period) {
    return jdbcClient
        .sql(
            """
            select id, household_id, period, label, income, house_contribution, planned
            from finance_months
            where household_id = :householdId and period = :period
            """)
        .param("householdId", householdId)
        .param("period", period.atDay(1))
        .query(JdbcFinancialMonthRepository::mapRow)
        .optional();
  }

  private static FinancialMonth mapRow(ResultSet rs, int rowNum) throws SQLException {
    return new FinancialMonth(
        UUID.fromString(rs.getString("id")),
        UUID.fromString(rs.getString("household_id")),
        YearMonth.from(rs.getDate("period").toLocalDate()),
        rs.getString("label"),
        Money.of(rs.getBigDecimal("income")),
        Money.of(rs.getBigDecimal("house_contribution")),
        rs.getBoolean("planned"));
  }
}
