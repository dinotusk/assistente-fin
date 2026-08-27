package com.aval.finance;

import java.util.List;

/**
 * The exact category set and declaration order from constants.ts's {@code categories} array.
 * Order matters: {@code getCategoryTotals} iterates this order before sorting by total, so ties
 * (equal totals) keep this relative order — JavaScript's {@code Array.sort} has been
 * stable since ES2019, and {@link com.aval.finance.summary.FinancialCalculator} relies on the
 * same guarantee from a stable Java sort.
 */
public final class Categories {

  public static final List<String> ORDER =
      List.of(
          "Alimentação",
          "Transporte",
          "Casa",
          "Gasto fixo",
          "Saúde",
          "Lazer",
          "Educação",
          "Cartões",
          "Dívida",
          "Empréstimo",
          "Investimento",
          "Livre",
          "Outros");

  private Categories() {}
}
