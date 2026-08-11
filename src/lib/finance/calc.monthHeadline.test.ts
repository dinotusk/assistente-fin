// P0-FRONTEND-1B.3 — getNextDueExpense/getMonthHeadline are the shared logic
// extracted from AssistantView's inline "primaryRecommendation" so the
// Painel can show the same "what needs attention" sentence without a second,
// possibly-diverging copy of the same rules. These are pure functions, so
// they're tested directly rather than through either UI.
import { describe, expect, it } from "vitest";

import { getMonthHeadline, getNextDueExpense } from "./calc";
import type { Metrics } from "./calc";
import type { Expense } from "./types";

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "exp-1",
    name: "Conta",
    category: "Outros",
    amount: 100,
    status: "A pagar",
    owner: "Maria",
    date: "2026-08-05",
    paymentMethod: "Pix",
    note: "",
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    total: 1000,
    received: 0,
    pending: 200,
    paid: 800,
    free: 500,
    saving: 0,
    paidRate: 0.8,
    daysLeft: 10,
    budget: 1500,
    ...overrides,
  };
}

const formatMoney = (value: number) => `R$ ${value.toFixed(2)}`;

describe("getNextDueExpense", () => {
  it("returns null when there are no pending expenses", () => {
    expect(getNextDueExpense([makeExpense({ status: "Pago" })])).toBeNull();
  });

  it("picks the earliest pending due date, ignoring paid items", () => {
    const soon = makeExpense({ id: "soon", dueDate: "2026-08-01", status: "A pagar" });
    const later = makeExpense({ id: "later", dueDate: "2026-08-20", status: "A pagar" });
    const paidEarlier = makeExpense({ id: "paid", dueDate: "2026-07-01", status: "Pago" });
    const result = getNextDueExpense([later, paidEarlier, soon]);
    expect(result?.expense.id).toBe("soon");
  });

  it("daysUntil is negative for an overdue bill", () => {
    const overdue = makeExpense({ dueDate: "2020-01-01" });
    const result = getNextDueExpense([overdue]);
    expect(result!.daysUntil).toBeLessThan(0);
  });
});

describe("getMonthHeadline", () => {
  it("leads with the over-budget warning when free is negative, regardless of other signals", () => {
    const numbers = makeMetrics({ free: -50 });
    const overdue = makeExpense({ dueDate: "2020-01-01" });
    const text = getMonthHeadline(numbers, [overdue], { category: "Casa", diff: 999 }, formatMoney);
    expect(text).toContain("orçamento passou");
    expect(text).toContain("R$ 50.00");
  });

  it("surfaces a bill due within 3 days ahead of category growth", () => {
    const numbers = makeMetrics({ free: 100 });
    const dueSoon = makeExpense({ name: "Aluguel", dueDate: soonDate(2) });
    const text = getMonthHeadline(numbers, [dueSoon], { category: "Casa", diff: 10 }, formatMoney);
    expect(text).toContain("Aluguel");
    expect(text).toContain("vence em 2 dias");
  });

  it("falls back to category growth when nothing is due soon", () => {
    const numbers = makeMetrics({ free: 100 });
    const dueFar = makeExpense({ dueDate: soonDate(20) });
    const text = getMonthHeadline(numbers, [dueFar], { category: "Saúde", diff: 40 }, formatMoney);
    expect(text).toContain("Saúde");
    expect(text).toContain("cresceu");
  });

  it("falls back to the weekly allowance sentence when there is no due bill or growth", () => {
    const numbers = makeMetrics({ free: 140, daysLeft: 14 });
    const text = getMonthHeadline(numbers, [], null, formatMoney);
    expect(text).toContain("gastar cerca de");
  });
});

function soonDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}
