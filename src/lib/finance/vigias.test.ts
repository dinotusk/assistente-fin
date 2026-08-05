import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { evaluateNewExpense, evaluateVigias, type Vigia } from "./vigias";
import type { Expense, FinanceState, MonthData } from "./types";

function makeExpense(overrides: Partial<Expense>): Expense {
  return {
    id: overrides.id || "e1",
    name: "Item",
    category: "Outros",
    amount: 100,
    status: "A pagar",
    owner: "Minha casa",
    date: "2026-07-15",
    paymentMethod: "Pix",
    note: "",
    ...overrides,
  };
}

function makeMonth(expenses: Expense[]): MonthData {
  return { label: "Julho 2026", income: 5000, houseContribution: 0, expenses, priorities: [] };
}

function makeState(months: Record<string, MonthData>, activeMonth = "2026-07"): FinanceState {
  return { people: ["Minha casa"], activePerson: "todos", activeMonth, months };
}

function vigia(overrides: Partial<Vigia>): Vigia {
  return {
    id: "v1",
    name: "Teste",
    tone: "direto",
    rule: "contaVencendo",
    enabled: true,
    lastFiredAt: null,
    frequency: "sempre",
    ...overrides,
  };
}

describe("evaluateVigias / contaVencendo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15));
  });
  afterEach(() => vi.useRealTimers());

  it("fires with erro severity for an overdue bill", () => {
    const month = makeMonth([
      makeExpense({ date: "2026-07-10", dueDate: "2026-07-10", amount: 200, status: "A pagar" }),
    ]);
    const state = makeState({ "2026-07": month });
    const alerts = evaluateVigias([vigia({ threshold: 3 })], state, month, []);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("erro");
  });

  it("does not fire for a bill due far in the future", () => {
    const month = makeMonth([
      makeExpense({ date: "2026-08-10", dueDate: "2026-08-10", status: "A pagar" }),
    ]);
    const state = makeState({ "2026-07": month });
    const alerts = evaluateVigias([vigia({ threshold: 3 })], state, month, []);
    expect(alerts).toHaveLength(0);
  });

  it("skips a disabled vigia", () => {
    const month = makeMonth([
      makeExpense({ date: "2026-07-10", dueDate: "2026-07-10", status: "A pagar" }),
    ]);
    const state = makeState({ "2026-07": month });
    const alerts = evaluateVigias([vigia({ enabled: false })], state, month, []);
    expect(alerts).toHaveLength(0);
  });

  it("respects lastFiredAt for 'sempre' frequency (once per day)", () => {
    const month = makeMonth([
      makeExpense({ date: "2026-07-10", dueDate: "2026-07-10", status: "A pagar" }),
    ]);
    const state = makeState({ "2026-07": month });
    const alerts = evaluateVigias(
      [vigia({ lastFiredAt: new Date(2026, 6, 15).toISOString() })],
      state,
      month,
      [],
    );
    expect(alerts).toHaveLength(0);
  });
});

describe("evaluateVigias / categoriaEstourou", () => {
  it("fires when spending in envelope categories exceeds the limit", () => {
    const month = makeMonth([
      makeExpense({ category: "Alimentação", amount: 600, status: "Pago" }),
    ]);
    const state = makeState({ "2026-07": month });
    const alerts = evaluateVigias(
      [vigia({ rule: "categoriaEstourou", frequency: "diaria" })],
      state,
      month,
      [{ id: "env1", label: "Essenciais", limit: 500, categories: ["Alimentação"] }],
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toContain("Essenciais");
  });
});

describe("evaluateNewExpense / gastoAcimaDoNormal", () => {
  it("fires when a new expense is more than double the 90-day category average", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15));
    const history = [
      makeExpense({ id: "h1", category: "Lazer", amount: 50, date: "2026-06-01" }),
      makeExpense({ id: "h2", category: "Lazer", amount: 60, date: "2026-06-10" }),
      makeExpense({ id: "h3", category: "Lazer", amount: 40, date: "2026-06-20" }),
    ];
    const state = makeState({ "2026-06": makeMonth(history), "2026-07": makeMonth([]) });
    const newExpense = makeExpense({
      id: "new",
      category: "Lazer",
      amount: 300,
      date: "2026-07-15",
    });

    const alert = evaluateNewExpense([vigia({ rule: "gastoAcimaDoNormal" })], state, newExpense);
    expect(alert).not.toBeNull();
    vi.useRealTimers();
  });

  it("does not fire with too little history", () => {
    const state = makeState({ "2026-07": makeMonth([]) });
    const newExpense = makeExpense({ category: "Lazer", amount: 300 });
    const alert = evaluateNewExpense([vigia({ rule: "gastoAcimaDoNormal" })], state, newExpense);
    expect(alert).toBeNull();
  });
});
