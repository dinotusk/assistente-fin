package com.aval.assistant.tools;

import com.aval.finance.expenses.EntryType;
import com.aval.finance.expenses.ExpensePage;
import com.aval.finance.expenses.ExpenseStatus;
import com.aval.finance.expenses.FinancialEntry;
import com.aval.finance.summary.ProvenancedMoney;
import java.util.List;

/** The wire shape for {@code GET /api/v1/tools/expenses}. Money is a JSON string — same rule as {@code FinancialSummaryResponse}. */
public record ExpensesResponse(int page, int pageSize, boolean hasMore, List<ExpenseItem> items) {

  public record ExpenseItem(
      String id,
      String ownerProfileId,
      String description,
      String type,
      String category,
      MoneyValue amount,
      String status,
      String expenseDate,
      String dueDate) {}

  public record MoneyValue(String value, String provenance) {}

  public static ExpensesResponse from(ExpensePage page) {
    List<ExpenseItem> items = page.items().stream().map(ExpensesResponse::itemOf).toList();
    return new ExpensesResponse(page.page(), page.pageSize(), page.hasMore(), items);
  }

  private static ExpenseItem itemOf(FinancialEntry entry) {
    // Every raw line amount is a stored column value, never an aggregate this endpoint derives —
    // see docs/architecture/financial-tools.md "Provenance": RECORDED here, unlike the CALCULATED
    // aggregates get_financial_summary/compare_months return.
    ProvenancedMoney amount = new ProvenancedMoney(entry.amount(), com.aval.finance.summary.Provenance.RECORDED);
    return new ExpenseItem(
        entry.id().toString(),
        entry.ownerProfileId().toString(),
        entry.description(),
        typeOf(entry.type()),
        entry.category(),
        new MoneyValue(amount.value().value().toPlainString(), amount.provenance().name()),
        statusOf(entry.status()),
        entry.expenseDate().toString(),
        entry.dueDate() != null ? entry.dueDate().toString() : null);
  }

  private static String typeOf(EntryType type) {
    return switch (type) {
      case EXPENSE -> "EXPENSE";
      case INCOME -> "INCOME";
    };
  }

  private static String statusOf(ExpenseStatus status) {
    return switch (status) {
      case PAID -> "PAID";
      case PENDING -> "PENDING";
    };
  }
}
