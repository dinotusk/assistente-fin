import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VIEW_ALL, VIEW_ME, VIEW_SPOUSE } from "./constants";
import {
  budgetForView,
  calc,
  daysLeftInMonth,
  expensesForView,
  money,
  normalizeText,
  profileId,
  sum,
} from "./calc";
import type { Expense, MonthData } from "./types";

function makeExpense(overrides: Partial<Expense>): Expense {
  return {
    id: overrides.id || "e1",
    name: "Item",
    category: "Outros",
    amount: 100,
    status: "A pagar",
    owner: "Minha casa",
    date: "2026-07-10",
    paymentMethod: "Pix",
    note: "",
    ...overrides,
  };
}

function makeMonth(overrides: Partial<MonthData>): MonthData {
  return {
    label: "Julho 2026",
    income: 5000,
    houseContribution: 1000,
    expenses: [],
    priorities: [],
    ...overrides,
  };
}

describe("money", () => {
  it("formats a number as BRL currency", () => {
    expect(money(1234.5)).toBe(
      (1234.5).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    );
  });

  it("treats non-finite/undefined amounts as zero", () => {
    expect(money(undefined as unknown as number)).toBe(money(0));
    expect(money(NaN)).toBe(money(0));
  });
});

describe("sum", () => {
  it("adds up amounts, defaulting missing ones to zero", () => {
    expect(sum([{ amount: 10 }, { amount: 5 }, {}])).toBe(15);
  });

  it("returns 0 for an empty list", () => {
    expect(sum([])).toBe(0);
  });
});

describe("normalizeText", () => {
  it("lowercases and strips accents", () => {
    expect(normalizeText("Saldo Disponível")).toBe("saldo disponivel");
  });
});

describe("profileId", () => {
  it("slugifies a name", () => {
    expect(profileId("Pai da Namorada")).toBe("pai-da-namorada");
  });

  it("falls back to 'perfil' when nothing is left after slugifying", () => {
    expect(profileId("!!!")).toBe("perfil");
  });
});

describe("budgetForView", () => {
  const month = makeMonth({ income: 5000, houseContribution: 1200, profileBudgets: { Convidado: 300 } });

  it("sums income + house contribution for VIEW_ALL", () => {
    expect(budgetForView(month, VIEW_ALL)).toBe(6200);
  });

  it("returns income for VIEW_ME", () => {
    expect(budgetForView(month, VIEW_ME)).toBe(5000);
  });

  it("returns house contribution for VIEW_SPOUSE", () => {
    expect(budgetForView(month, VIEW_SPOUSE)).toBe(1200);
  });

  it("returns the named profile's budget for any other view", () => {
    expect(budgetForView(month, "Convidado")).toBe(300);
  });
});

describe("expensesForView", () => {
  const month = makeMonth({
    expenses: [
      makeExpense({ id: "e1", owner: "Minha casa" }),
      makeExpense({ id: "e2", owner: "Pai da namorada" }),
    ],
  });

  it("returns everything for VIEW_ALL", () => {
    expect(expensesForView(month, VIEW_ALL)).toHaveLength(2);
  });

  it("filters by the resolved owner for a specific view", () => {
    expect(expensesForView(month, VIEW_ME).map((e) => e.id)).toEqual(["e1"]);
    expect(expensesForView(month, VIEW_SPOUSE).map((e) => e.id)).toEqual(["e2"]);
  });
});

describe("daysLeftInMonth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15)); // July 15, 2026
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts remaining days (inclusive of today) for the current month", () => {
    expect(daysLeftInMonth("2026-07")).toBe(17); // 31 - 15 + 1
  });

  it("defaults to the current month when no key is given", () => {
    expect(daysLeftInMonth()).toBe(17);
  });

  it("returns 0 for a month that has already passed", () => {
    expect(daysLeftInMonth("2026-06")).toBe(0);
  });

  it("returns the full month length for a future month", () => {
    expect(daysLeftInMonth("2026-09")).toBe(30);
  });
});

describe("calc", () => {
  const month = makeMonth({
    income: 5000,
    houseContribution: 1000,
    expenses: [
      makeExpense({ id: "e1", amount: 200, status: "Pago", category: "Alimentação" }),
      makeExpense({ id: "e2", amount: 300, status: "A pagar", category: "Alimentação" }),
      makeExpense({ id: "e3", amount: 150, status: "Pago", type: "income" }),
    ],
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes totals, pending/paid split and free balance", () => {
    const result = calc(month, VIEW_ALL, "2026-07");
    expect(result.total).toBe(500); // expenses only, income entry excluded
    expect(result.paid).toBe(200);
    expect(result.pending).toBe(300);
    expect(result.received).toBe(150);
    expect(result.budget).toBe(6000); // income + houseContribution
    expect(result.free).toBe(5500); // budget - total
    expect(result.topCategory).toEqual({ category: "Alimentação", total: 500 });
  });

  it("computes paidRate as paid/total, 0 when there's no spending", () => {
    expect(calc(month, VIEW_ALL, "2026-07").paidRate).toBeCloseTo(200 / 500);
    expect(calc(makeMonth({}), VIEW_ALL, "2026-07").paidRate).toBe(0);
  });

  it("threads the month key through to daysLeft", () => {
    expect(calc(month, VIEW_ALL, "2026-06").daysLeft).toBe(0);
    expect(calc(month, VIEW_ALL, "2026-07").daysLeft).toBe(17);
  });
});
