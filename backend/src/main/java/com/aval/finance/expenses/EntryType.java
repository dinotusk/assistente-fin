package com.aval.finance.expenses;

/** Mirrors {@code expenses.entry_type}'s check constraint exactly ({@code 'expense' | 'income'}). */
public enum EntryType {
  EXPENSE,
  INCOME;

  public static EntryType fromDb(String value) {
    return switch (value) {
      case "expense" -> EXPENSE;
      case "income" -> INCOME;
      default -> throw new IllegalArgumentException("Unknown expenses.entry_type: " + value);
    };
  }
}
