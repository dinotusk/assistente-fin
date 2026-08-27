package com.aval.finance.expenses;

import com.aval.finance.Money;
import java.time.LocalDate;
import java.util.UUID;

/**
 * One row of {@code expenses} — named {@code FinancialEntry}, not {@code Expense}, because the
 * table (and calc.ts's {@code Expense} type) holds both expense AND income rows, distinguished
 * by {@link #type()}; "expense" as a name would be misleading for an income row.
 */
public record FinancialEntry(
    UUID id,
    UUID ownerProfileId,
    String description,
    EntryType type,
    String category,
    Money amount,
    ExpenseStatus status,
    LocalDate expenseDate,
    LocalDate dueDate) {}
