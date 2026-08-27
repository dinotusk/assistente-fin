// P0-FINANCIAL-TRUTH — cross-cutting invariants of the financial domain that
// no single existing test file states explicitly. These are pure calc.ts
// functions, so each invariant is proven directly against calc.ts rather
// than through a component. The fixture is a small, deterministic household
// with 3 profiles (not real production data) — sized so every invariant can
// be checked by hand from the numbers alone.
//
// Fixture summary (August 2026 — "the active month"):
//   Ana (VIEW_ME):    income 4000, expenses 1200 (700 Casa A pagar + 500 Alimentação Pago)
//   Rafael (VIEW_SPOUSE): houseContribution 1500, expenses 300 (Transporte Pago)
//   Beto (3rd profile "Beto"): profileBudgets.Beto = 400, expenses 100 (Lazer Pago)
//   Household (VIEW_ALL): expenses = 1200+300+100 = 1600 (union, no double counting)
//
// July 2026 (the previous month) has a deliberately DIFFERENT set of numbers
// so any accidental cross-month leakage is loud, not silent.
import { describe, expect, it } from "vitest";

import { VIEW_ALL, VIEW_ME, VIEW_SPOUSE } from "./constants";
import {
  budgetForView,
  calc,
  chartMonthEntries,
  expenseMatchesView,
  expensesForView,
  getCategoryTotals,
  sum,
  timelineMonthEntries,
} from "./calc";
import type { Expense, FinanceState, MonthData } from "./types";

const PEOPLE = ["Ana", "Rafael", "Beto"];
const AUGUST = "2026-08";
const JULY = "2026-07";

function expense(overrides: Partial<Expense>): Expense {
  return {
    id: overrides.id || "e",
    name: overrides.name || "Item",
    category: overrides.category || "Outros",
    amount: overrides.amount ?? 100,
    status: overrides.status || "Pago",
    owner: overrides.owner || "Ana",
    date: overrides.date || `${AUGUST}-10`,
    paymentMethod: "Pix",
    note: "",
    ...overrides,
  };
}

function augustMonth(): MonthData {
  return {
    label: "Agosto 2026",
    income: 4000,
    houseContribution: 1500,
    profileBudgets: { Beto: 400 },
    expenses: [
      expense({ id: "a1", owner: "Ana", category: "Casa", amount: 700, status: "A pagar" }),
      expense({ id: "a2", owner: "Ana", category: "Alimentação", amount: 500, status: "Pago" }),
      expense({ id: "r1", owner: "Rafael", category: "Transporte", amount: 300, status: "Pago" }),
      expense({ id: "b1", owner: "Beto", category: "Lazer", amount: 100, status: "Pago" }),
    ],
    priorities: [],
  };
}

/** Deliberately different totals/categories from August, to catch leakage. */
function julyMonth(): MonthData {
  return {
    label: "Julho 2026",
    income: 3000,
    houseContribution: 0,
    expenses: [
      expense({ id: "j1", owner: "Ana", category: "Saúde", amount: 9999, date: `${JULY}-05` }),
    ],
    priorities: [],
  };
}

function financeState(): FinanceState {
  return {
    people: PEOPLE,
    activePerson: VIEW_ALL,
    activeMonth: AUGUST,
    months: { [JULY]: julyMonth(), [AUGUST]: augustMonth() },
  };
}

describe("Invariante 1 — household expenses = soma dos gastos dos perfis incluídos", () => {
  it("VIEW_ALL's total equals Ana + Rafael + Beto's totals, no double counting, no omission", () => {
    const month = augustMonth();
    const householdTotal = calc(month, VIEW_ALL, AUGUST, PEOPLE).total;
    const anaTotal = calc(month, VIEW_ME, AUGUST, PEOPLE).total;
    const rafaelTotal = calc(month, VIEW_SPOUSE, AUGUST, PEOPLE).total;
    const betoTotal = calc(month, "Beto", AUGUST, PEOPLE).total;
    expect(householdTotal).toBe(anaTotal + rafaelTotal + betoTotal);
    expect(householdTotal).toBe(1600);
  });

  it("VIEW_ALL returns exactly the union of every profile's expenses (each id exactly once)", () => {
    const month = augustMonth();
    const allIds = expensesForView(month, VIEW_ALL, PEOPLE)
      .map((e) => e.id)
      .sort();
    const perProfileIds = [
      ...expensesForView(month, VIEW_ME, PEOPLE),
      ...expensesForView(month, VIEW_SPOUSE, PEOPLE),
      ...expensesForView(month, "Beto", PEOPLE),
    ]
      .map((e) => e.id)
      .sort();
    expect(allIds).toEqual(perProfileIds);
  });
});

describe("Invariante 2 — profile expenses = somente gastos daquele perfil", () => {
  it("Ana's view never includes Rafael's or Beto's expenses", () => {
    const month = augustMonth();
    const anaIds = expensesForView(month, VIEW_ME, PEOPLE).map((e) => e.id);
    expect(anaIds).toEqual(["a1", "a2"]);
  });

  it("Rafael's view never includes Ana's or Beto's expenses", () => {
    const month = augustMonth();
    const rafaelIds = expensesForView(month, VIEW_SPOUSE, PEOPLE).map((e) => e.id);
    expect(rafaelIds).toEqual(["r1"]);
  });

  it("a named 3rd+ profile's view never includes the other two profiles' expenses", () => {
    const month = augustMonth();
    const betoIds = expensesForView(month, "Beto", PEOPLE).map((e) => e.id);
    expect(betoIds).toEqual(["b1"]);
  });
});

describe("Invariante 3 — activeMonth nunca mistura despesas de outro período", () => {
  it("calc() for August never includes July's amounts, and vice-versa", () => {
    const state = financeState();
    const augustTotal = calc(state.months[AUGUST], VIEW_ALL, AUGUST, PEOPLE).total;
    const julyTotal = calc(state.months[JULY], VIEW_ALL, JULY, PEOPLE).total;
    expect(augustTotal).toBe(1600);
    expect(julyTotal).toBe(9999);
    expect(augustTotal).not.toBe(julyTotal);
  });

  it("timelineMonthEntries (Histórico de meses) keeps each entry's own expenses, not activeMonth's", () => {
    const state = financeState();
    const entries = timelineMonthEntries(state);
    const totals = Object.fromEntries(
      entries.map(([key, data]) => [key, sum(expensesForView(data, VIEW_ALL, PEOPLE))]),
    );
    // Regardless of state.activeMonth being August, July's card must show July's own total.
    expect(totals[JULY]).toBe(9999);
    expect(totals[AUGUST]).toBe(1600);
  });

  it("chartMonthEntries (comparação mensal / evolução) keeps each month's own total independent of activeMonth", () => {
    const state = financeState();
    const entries = chartMonthEntries(state, 6).map(([key, data]) => ({
      key,
      total: sum(expensesForView(data, VIEW_ALL, PEOPLE)),
    }));
    const julyEntry = entries.find((e) => e.key === JULY);
    const augustEntry = entries.find((e) => e.key === AUGUST);
    expect(julyEntry?.total).toBe(9999);
    expect(augustEntry?.total).toBe(1600);
  });
});

describe("Invariante 4 — troca de perfil não altera dados persistidos", () => {
  it("calling calc()/expensesForView() with different views never mutates the source month", () => {
    const month = augustMonth();
    const before = JSON.parse(JSON.stringify(month));
    calc(month, VIEW_ME, AUGUST, PEOPLE);
    calc(month, VIEW_SPOUSE, AUGUST, PEOPLE);
    calc(month, "Beto", AUGUST, PEOPLE);
    calc(month, VIEW_ALL, AUGUST, PEOPLE);
    expect(month).toEqual(before);
  });

  it("expensesForView returns a fresh filtered array, never the original expenses array by reference", () => {
    const month = augustMonth();
    const filtered = expensesForView(month, VIEW_ME, PEOPLE);
    expect(filtered).not.toBe(month.expenses);
  });
});

describe("Invariante 5 — hideValues é somente apresentação, nunca cálculo", () => {
  it("calc()/budgetForView()/expensesForView() have no hideValues parameter — structurally cannot affect the math", () => {
    // Documents the invariant at the type level: none of the pure finance
    // functions accept a hideValues-shaped argument. Masking happens only in
    // useMoney() (FinanceContext.tsx), which formats calc()'s already-final
    // numbers — it never feeds back into them.
    expect(calc.length).toBe(4); // (monthData, view, monthKey?, people?)
    expect(budgetForView.length).toBe(2); // (monthData, view)
    expect(expensesForView.length).toBe(3); // (monthData, view, people?)
  });

  it("calc() returns identical numbers regardless of any presentation concern — same input, same output", () => {
    const month = augustMonth();
    const first = calc(month, VIEW_ALL, AUGUST, PEOPLE);
    const second = calc(month, VIEW_ALL, AUGUST, PEOPLE);
    expect(first).toEqual(second);
  });
});

describe("Invariante 6 — category breakdown soma consistente com os gastos do escopo", () => {
  it("the sum of getCategoryTotals equals calc().total for the same scope (VIEW_ALL)", () => {
    const month = augustMonth();
    const byCategory = getCategoryTotals(month, VIEW_ALL, PEOPLE);
    const categorySum = sum(byCategory.map((c) => ({ amount: c.total })));
    expect(categorySum).toBe(calc(month, VIEW_ALL, AUGUST, PEOPLE).total);
  });

  it("the sum of getCategoryTotals equals calc().total for a single profile's scope (Ana)", () => {
    const month = augustMonth();
    const byCategory = getCategoryTotals(month, VIEW_ME, PEOPLE);
    const categorySum = sum(byCategory.map((c) => ({ amount: c.total })));
    expect(categorySum).toBe(calc(month, VIEW_ME, AUGUST, PEOPLE).total);
  });
});

describe("Invariante 9 — Gastos (TransactionsView) sem busca/filtro concorda com calc(), mesma fonte de verdade", () => {
  // TransactionsView.tsx:64-81 re-implements the expense/income split inline
  // (expenseMatchesView + sum by type) instead of calling calc() directly.
  // With no search term and filter="todos" (the default state), this must
  // produce the exact same numbers as calc() for the same scope — proven
  // here rather than assumed from reading the code side-by-side.
  function transactionsViewTotals(month: MonthData, view: string) {
    const rows = month.expenses.filter((item) => expenseMatchesView(item, view, PEOPLE));
    return {
      incomeTotal: sum(rows.filter((item) => item.type === "income")),
      expenseTotal: sum(rows.filter((item) => item.type !== "income")),
    };
  }

  it("VIEW_ALL: Gastos' Entradas/Saídas equal calc().received/.total with no filter active", () => {
    const month = augustMonth();
    const { incomeTotal, expenseTotal } = transactionsViewTotals(month, VIEW_ALL);
    const numbers = calc(month, VIEW_ALL, AUGUST, PEOPLE);
    expect(expenseTotal).toBe(numbers.total);
    expect(incomeTotal).toBe(numbers.received);
  });

  it("a single profile (Ana): Gastos' Entradas/Saídas equal calc().received/.total with no filter active", () => {
    const month = augustMonth();
    const { incomeTotal, expenseTotal } = transactionsViewTotals(month, VIEW_ME);
    const numbers = calc(month, VIEW_ME, AUGUST, PEOPLE);
    expect(expenseTotal).toBe(numbers.total);
    expect(incomeTotal).toBe(numbers.received);
  });
});

describe("Invariante 8 (divergência encontrada, NÃO corrigida — ver relatório P0-FINANCIAL-TRUTH) — Divisão familiar (DashboardView) computa total/pending com fórmula própria, não com calc()", () => {
  // DashboardView.tsx:330-334 computes each family card's total/"Falta pagar"
  // as `sum(expensesForView(...))` / `sum(...).filter(status==='A pagar')`
  // WITHOUT excluding type==="income", unlike calc()'s .total/.pending which
  // explicitly filter income out first (calc.ts:179,183). This test
  // replicates DashboardView's exact inline formula to prove the divergence
  // is real and reproducible — not to assert which one is "correct".
  // Impact today: NONE — a live production query (2026-08) shows every
  // existing expense row has entry_type="expense"; zero income-type rows
  // exist, so this divergence is currently dormant. It would only surface if
  // an income-type entry ever received status "A pagar".
  function divisaoFamiliarTotal(month: MonthData, key: string): number {
    const mine = expensesForView(month, key, PEOPLE);
    return sum(mine); // DashboardView's own formula — no income filter
  }
  function divisaoFamiliarPending(month: MonthData, key: string): number {
    const mine = expensesForView(month, key, PEOPLE);
    return sum(mine.filter((e) => e.status === "A pagar")); // same — no income filter
  }

  it("with an income-type 'A pagar' entry, DashboardView's total diverges from calc().total", () => {
    const month = augustMonth();
    month.expenses.push(
      expense({
        id: "income-1",
        owner: "Ana",
        type: "income",
        category: "Livre",
        amount: 1000,
        status: "A pagar",
      }),
    );
    const calcTotal = calc(month, VIEW_ME, AUGUST, PEOPLE).total; // excludes income → 1200
    const dashboardTotal = divisaoFamiliarTotal(month, VIEW_ME); // includes income → 2200
    expect(calcTotal).toBe(1200);
    expect(dashboardTotal).toBe(2200);
    expect(dashboardTotal).not.toBe(calcTotal); // proves the divergence
  });

  it("with the same fixture, DashboardView's 'Falta pagar' diverges from calc().pending", () => {
    const month = augustMonth();
    month.expenses.push(
      expense({
        id: "income-1",
        owner: "Ana",
        type: "income",
        category: "Livre",
        amount: 1000,
        status: "A pagar",
      }),
    );
    const calcPending = calc(month, VIEW_ME, AUGUST, PEOPLE).pending; // excludes income → 700 (only a1)
    const dashboardPending = divisaoFamiliarPending(month, VIEW_ME); // includes income → 1700
    expect(calcPending).toBe(700);
    expect(dashboardPending).toBe(1700);
    expect(dashboardPending).not.toBe(calcPending); // proves the divergence
  });

  it("without any income-type entry (today's real production shape), both formulas agree", () => {
    const month = augustMonth();
    expect(divisaoFamiliarTotal(month, VIEW_ME)).toBe(calc(month, VIEW_ME, AUGUST, PEOPLE).total);
    expect(divisaoFamiliarPending(month, VIEW_ME)).toBe(
      calc(month, VIEW_ME, AUGUST, PEOPLE).pending,
    );
  });
});

describe("Invariante 7 (produto, documentada — não é bug) — profileBudgets de perfis 3+ não somam no orçamento de VIEW_ALL", () => {
  // Já coberto por calc.test.ts ("sums income + house contribution for
  // VIEW_ALL"), repetido aqui com o vocabulário de invariantes para deixar
  // explícito que isso é intencional, não uma omissão: budgetForView(VIEW_ALL)
  // nunca soma profileBudgets, mesmo que expensesForView(VIEW_ALL) inclua os
  // gastos desse mesmo perfil. Ver relatório P0-FINANCIAL-TRUTH, item 16 —
  // isto é uma AMBIGUIDADE DE PRODUTO a decidir, não uma correção a aplicar.
  it("Beto's expenses count in the household total, but Beto's budget does not", () => {
    const month = augustMonth();
    const householdExpenses = calc(month, VIEW_ALL, AUGUST, PEOPLE).total;
    const householdBudget = budgetForView(month, VIEW_ALL);
    expect(householdExpenses).toBe(1600); // includes Beto's 100
    expect(householdBudget).toBe(5500); // income(4000) + houseContribution(1500) — Beto's 400 excluded
    expect(householdBudget).not.toBe(5900); // would be 5500+400 if profileBudgets were included
  });
});
