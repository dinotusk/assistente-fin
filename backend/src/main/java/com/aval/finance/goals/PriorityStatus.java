package com.aval.finance.goals;

/**
 * Mirrors {@code priorities.status}'s check constraint exactly ({@code 'A pagar' | 'Pago' |
 * 'Adiar'}) — a third value beyond {@link com.aval.finance.expenses.ExpenseStatus}'s two, because
 * a priority (unlike an expense) can be explicitly postponed.
 */
public enum PriorityStatus {
  PENDING,
  PAID,
  DEFERRED;

  public static PriorityStatus fromDb(String value) {
    return switch (value) {
      case "A pagar" -> PENDING;
      case "Pago" -> PAID;
      case "Adiar" -> DEFERRED;
      default -> throw new IllegalArgumentException("Unknown priorities.status: " + value);
    };
  }
}
