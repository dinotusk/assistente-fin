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
}
