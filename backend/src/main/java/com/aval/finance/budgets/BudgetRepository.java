package com.aval.finance.budgets;

import com.aval.finance.Money;
import java.util.Map;
import java.util.UUID;

/**
 * Reads {@code profile_budgets} — a household's per-profile budget lines for a given month. A
 * profile with no row for this month is absent from the returned map (never a zero-amount
 * entry); the calculator defaults a missing lookup to {@link Money#ZERO}, exactly like calc.ts's
 * {@code profileBudgets?.[view] || 0}.
 */
public interface BudgetRepository {

  Map<UUID, Money> findByHouseholdAndMonth(UUID householdId, UUID monthId);
}
