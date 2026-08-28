package com.aval.finance.expenses;

import java.util.Optional;
import java.util.UUID;

/**
 * Filters for {@code get_expenses} (P3-FINANCIAL-TOOLS). {@code householdId}/{@code monthId} are
 * always required and server-resolved (never a raw client value) — see {@code
 * ExpenseRepository#search}'s javadoc. {@code ownerProfileId} carries the already-resolved scope
 * filter (see {@code FinancialCalculator#entriesFor}'s "position, not kind" rule) — {@code
 * empty()} means household-wide, never "no filter applied by mistake".
 *
 * <p>{@code offset}/{@code limit} implement page-by-{@code pageSize} pagination; the repository is
 * asked for {@code limit + 1} rows (see {@code JdbcExpenseRepository#search}) so the use case can
 * detect {@code hasMore} without a separate {@code COUNT(*)} query.
 */
public record ExpenseSearchCriteria(
    UUID householdId,
    UUID monthId,
    Optional<UUID> ownerProfileId,
    Optional<String> category,
    Optional<ExpenseStatus> status,
    Optional<EntryType> entryType,
    int offset,
    int limit) {}
