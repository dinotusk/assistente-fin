import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VIEW_ALL, VIEW_ME, VIEW_SPOUSE } from "./constants";
import {
  budgetForView,
  calc,
  daysLeftInMonth,
  expensesForView,
  maskMoneyInText,
  money,
  normalizeMoneyInText,
  normalizeText,
  profileId,
  sum,
  summarizeImport,
} from "./calc";
import type { Expense, ImportSummary, MonthData } from "./types";

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

describe("maskMoneyInText", () => {
  it("replaces every currency amount with a masked placeholder", () => {
    expect(maskMoneyInText("Voce gastou R$ 1.234,56 de R$ 5.000,00")).toBe(
      "Voce gastou R$ •••• de R$ ••••",
    );
  });

  it("handles negative amounts and leaves the rest of the text untouched", () => {
    expect(maskMoneyInText("Saldo: R$ -120,00. Tudo certo.")).toBe("Saldo: R$ ••••. Tudo certo.");
  });

  it("is a no-op when there is no currency amount", () => {
    expect(maskMoneyInText("Nenhum gasto encontrado.")).toBe("Nenhum gasto encontrado.");
  });
});

// P7.1.2 — Gemini generates the Assistant's free-text answer itself from a raw
// decimal string the backend hands it (e.g. "6800.00", see
// FinancialSummaryResponse's Money-as-string contract) and isn't reliably
// consistent about pt-BR punctuation. This normalizes only "R$"-led amounts,
// deterministically, with pure string math (no Number()/parseFloat).
describe("normalizeMoneyInText", () => {
  it.each([
    ["R$6800,00", "R$ 6.800,00"],
    ["R$ 6800,00", "R$ 6.800,00"],
    ["R$6800.00", "R$ 6.800,00"],
    ["R$ 6800.00", "R$ 6.800,00"],
    ["R$50", "R$ 50,00"],
    ["R$ 50", "R$ 50,00"],
    ["R$0,00", "R$ 0,00"],
    ["R$15100,50", "R$ 15.100,50"],
  ])("normalizes %s -> %s", (input, expected) => {
    expect(normalizeMoneyInText(input)).toBe(expected);
  });

  it("leaves an already-correctly-formatted amount unchanged (idempotent)", () => {
    expect(normalizeMoneyInText("R$ 6.800,00")).toBe("R$ 6.800,00");
    expect(normalizeMoneyInText(normalizeMoneyInText("R$6800,00"))).toBe(
      normalizeMoneyInText("R$6800,00"),
    );
  });

  it("normalizes every occurrence in a response with multiple amounts", () => {
    expect(normalizeMoneyInText("Gastou R$1200,00 de R$6800,00, sobrando R$5600,00")).toBe(
      "Gastou R$ 1.200,00 de R$ 6.800,00, sobrando R$ 5.600,00",
    );
  });

  it("leaves a plain year untouched", () => {
    expect(normalizeMoneyInText("para julho de 2026, o resumo é R$6800,00")).toBe(
      "para julho de 2026, o resumo é R$ 6.800,00",
    );
  });

  it("leaves a percentage untouched", () => {
    expect(normalizeMoneyInText("você já usou 12,5% do orçamento de R$6800,00")).toBe(
      "você já usou 12,5% do orçamento de R$ 6.800,00",
    );
  });

  it("leaves an installment count untouched", () => {
    expect(normalizeMoneyInText("parcelado em 12 parcelas de R$50")).toBe(
      "parcelado em 12 parcelas de R$ 50,00",
    );
  });

  it("is a no-op on text with no currency amount", () => {
    const text = "Nenhum gasto encontrado para o período selecionado.";
    expect(normalizeMoneyInText(text)).toBe(text);
  });

  it("normalizes the full real smoke-test response end to end", () => {
    const raw =
      "Certo, para julho de 2026, a sua casa tem um orçamento total de R$6800,00. " +
      "Até agora, foram gastos R$4330,00, sendo R$1780,00 já pagos e R$2550,00 " +
      "ainda pendentes.\n\nIsso deixa um saldo livre de R$2470,00. A categoria de " +
      'maior gasto no mês é "Gasto fixo", com R$1760,00.';
    const expected =
      "Certo, para julho de 2026, a sua casa tem um orçamento total de R$ 6.800,00. " +
      "Até agora, foram gastos R$ 4.330,00, sendo R$ 1.780,00 já pagos e R$ 2.550,00 " +
      "ainda pendentes.\n\nIsso deixa um saldo livre de R$ 2.470,00. A categoria de " +
      'maior gasto no mês é "Gasto fixo", com R$ 1.760,00.';
    expect(normalizeMoneyInText(raw)).toBe(expected);
  });
});

describe("normalizeText", () => {
  it("lowercases and strips accents", () => {
    expect(normalizeText("Saldo Disponível")).toBe("saldo disponivel");
  });
});

describe("profileId", () => {
  it("slugifies a name", () => {
    expect(profileId("Outra casa")).toBe("outra-casa");
  });

  it("falls back to 'perfil' when nothing is left after slugifying", () => {
    expect(profileId("!!!")).toBe("perfil");
  });
});

describe("budgetForView", () => {
  const month = makeMonth({
    income: 5000,
    houseContribution: 1200,
    profileBudgets: { Convidado: 300 },
  });

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
      makeExpense({ id: "e2", owner: "Outra casa" }),
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

describe("summarizeImport", () => {
  function makeSummary(overrides: Partial<ImportSummary>): ImportSummary {
    return { importedExpenses: 0, importedPriorities: 0, skipped: [], duplicates: 0, ...overrides };
  }

  it("reports the real added count when there are new items", () => {
    expect(summarizeImport(makeSummary({ importedExpenses: 2 }))).toBe(
      "Importação concluída. 2 lançamentos adicionados.",
    );
    expect(summarizeImport(makeSummary({ importedExpenses: 1 }))).toBe(
      "Importação concluída. 1 lançamento adicionado.",
    );
  });

  it("says every item already existed when nothing new but duplicates were found", () => {
    expect(summarizeImport(makeSummary({ duplicates: 34 }))).toBe(
      "Todos os lançamentos deste arquivo já estavam importados.",
    );
  });

  it("falls back to a generic empty message when there's nothing added and nothing duplicated either", () => {
    expect(summarizeImport(makeSummary({}))).toBe("Nenhum lançamento novo foi adicionado.");
  });

  it("still appends the skipped-owner note regardless of which added/duplicate branch applies", () => {
    expect(
      summarizeImport(
        makeSummary({
          duplicates: 5,
          skipped: [{ reason: "unresolved_owner", ownerRaw: "João", description: "Presente" }],
        }),
      ),
    ).toBe(
      "Todos os lançamentos deste arquivo já estavam importados. 1 lançamento não foi importado por responsável desconhecido (João).",
    );
  });
});
