package com.aval.finance.expenses;

import java.util.List;

/**
 * One page of {@code get_expenses} results. {@code hasMore} is derived from fetching {@code
 * pageSize + 1} rows (see {@code ExpenseRepository#search}) and trimming the extra one here —
 * deliberately avoids a separate {@code COUNT(*)} query per page.
 */
public record ExpensePage(List<FinancialEntry> items, int page, int pageSize, boolean hasMore) {

  public static ExpensePage of(List<FinancialEntry> fetched, int page, int pageSize) {
    boolean hasMore = fetched.size() > pageSize;
    List<FinancialEntry> trimmed = hasMore ? fetched.subList(0, pageSize) : fetched;
    return new ExpensePage(trimmed, page, pageSize, hasMore);
  }
}
