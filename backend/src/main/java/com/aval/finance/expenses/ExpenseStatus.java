package com.aval.finance.expenses;

/**
 * Mirrors {@code expenses.status}'s check constraint exactly ({@code 'Pago' | 'A pagar'}) —
 * the database stores these Portuguese strings verbatim, and this mapper is the only place
 * that translates them; the database itself is never altered. ({@code priorities.status} adds
 * a third value, {@code 'Adiar'}, but priorities are out of scope for P2-FINANCIAL-DOMAIN —
 * see docs/architecture/financial-domain.md.)
 */
public enum ExpenseStatus {
  PAID,
  PENDING;

  public static ExpenseStatus fromDb(String value) {
    return switch (value) {
      case "Pago" -> PAID;
      case "A pagar" -> PENDING;
      default -> throw new IllegalArgumentException("Unknown expenses.status: " + value);
    };
  }
}
