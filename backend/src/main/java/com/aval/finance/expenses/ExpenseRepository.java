package com.aval.finance.expenses;

import java.util.List;
import java.util.UUID;

public interface ExpenseRepository {

  /**
   * Every entry belonging to a given month — matched by {@code month_id} (the FK), exactly like
   * supabaseRepository.ts's {@code loadRemoteFinance} ({@code expense.month_id ===
   * remoteMonth.id}), never by {@code competence} range matching.
   */
  List<FinancialEntry> findByHouseholdAndMonth(UUID householdId, UUID monthId);

  /**
   * P3-FINANCIAL-TOOLS — {@code get_expenses}'s filtered, paginated listing. Ordered most-recent
   * first ({@code expense_date desc}), with {@code id desc} as a stable tiebreak for rows sharing
   * a date (deterministic, not chronological — see docs/architecture/financial-tools.md). Returns
   * up to {@link ExpenseSearchCriteria#limit()} {@code + 1} rows so the use case can detect
   * {@code hasMore} without a separate {@code COUNT(*)} query.
   */
  List<FinancialEntry> search(ExpenseSearchCriteria criteria);
}
