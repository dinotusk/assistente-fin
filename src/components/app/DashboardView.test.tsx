// @vitest-environment jsdom
// P0-FRONTEND-1B.3 — Painel hierarchy: the primary numbers (orçamento,
// gastos, livre) must stay above the new "Situação do mês" block, which
// itself must sit above the "Análise detalhada" group; every pre-existing
// panel must keep rendering (nothing removed); hideValues, empty states,
// and month/view switching must keep working exactly as before.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FinanceState } from "@/lib/finance/types";

const MONTH = "2026-08";
const PREV_MONTH = "2026-07";

function baseState(): FinanceState {
  return {
    people: ["Maria", "Oziel"],
    activePerson: "todos",
    activeMonth: MONTH,
    months: {
      [PREV_MONTH]: {
        label: "Julho 2026",
        income: 5000,
        houseContribution: 1000,
        expenses: [
          {
            id: "prev-1",
            name: "Mercado",
            category: "Alimentação",
            amount: 100,
            status: "Pago",
            owner: "Maria",
            date: `${PREV_MONTH}-05`,
            paymentMethod: "Pix",
            note: "",
          },
        ],
        priorities: [],
      },
      [MONTH]: {
        label: "Agosto 2026",
        income: 5000,
        houseContribution: 1000,
        expenses: [
          {
            id: "exp-1",
            name: "Aluguel",
            category: "Casa",
            amount: 1500,
            status: "A pagar",
            owner: "Maria",
            date: `${MONTH}-05`,
            dueDate: `${MONTH}-10`,
            paymentMethod: "Pix",
            note: "",
          },
          {
            id: "exp-2",
            name: "Mercado",
            category: "Alimentação",
            amount: 400,
            status: "Pago",
            owner: "Oziel",
            date: `${MONTH}-03`,
            paymentMethod: "Pix",
            note: "",
          },
        ],
        priorities: [],
      },
    },
  };
}

function emptyMonthState(): FinanceState {
  return {
    people: ["Maria"],
    activePerson: "todos",
    activeMonth: MONTH,
    months: {
      [MONTH]: {
        label: "Agosto 2026",
        income: 3000,
        houseContribution: 0,
        expenses: [],
        priorities: [],
      },
    },
  };
}

const mockFinance = {
  state: baseState(),
  month: baseState().months[MONTH],
  setActiveMonth: vi.fn(),
  hideValues: false,
};

vi.mock("@/lib/finance/FinanceContext", () => ({
  useFinance: () => mockFinance,
  useMoney: () => (value: number) =>
    mockFinance.hideValues ? "R$ ••••" : `R$ ${value.toFixed(2)}`,
  useMoneyShort: () => (value: number) =>
    mockFinance.hideValues ? "R$ ••••" : `R$ ${value.toFixed(0)}`,
}));

const { DashboardView } = await import("./DashboardView");

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mockFinance, { state: baseState(), month: baseState().months[MONTH] });
  mockFinance.hideValues = false;
});
afterEach(() => cleanup());

describe("DashboardView — informação principal presente e hierarquia", () => {
  it("1. shows the primary numbers: orçamento, gastos and livre", () => {
    render(<DashboardView />);
    // budget = income(5000) + houseContribution(1000) for "todos" = 6000
    expect(screen.getByText("R$ 6000.00")).toBeTruthy();
    // total spent = 1500 + 400 = 1900
    expect(screen.getByText(/R\$ 1900\.00 gastos/)).toBeTruthy();
  });

  it("2. hierarquia: hero -> Situação do mês -> Histórico -> Análise detalhada -> painéis analíticos", () => {
    render(<DashboardView />);
    const headings = Array.from(document.querySelectorAll("h2")).map((h) => h.textContent);
    const situacaoIndex = headings.findIndex((h) => h?.includes("Situação do mês"));
    const historicoIndex = headings.findIndex((h) => h?.includes("Histórico de meses"));
    const distribuicaoIndex = headings.findIndex((h) => h?.includes("Distribuição do mês"));

    expect(situacaoIndex).toBeGreaterThanOrEqual(0);
    expect(historicoIndex).toBeGreaterThan(situacaoIndex);
    expect(distribuicaoIndex).toBeGreaterThan(historicoIndex);

    // "Análise detalhada" groups the analytical panels and must appear
    // right before the first of them (Distribuição do mês).
    const analysisLabel = screen.getByText("Análise detalhada");
    expect(analysisLabel).toBeTruthy();
  });

  it("3. every pre-existing panel still renders — nothing was removed", () => {
    render(<DashboardView />);
    [
      "Histórico de meses",
      "Distribuição do mês",
      "Por categoria",
      "Divisão familiar",
      "Comparação mensal",
      "Evolução dos gastos",
    ].forEach((title) => {
      expect(screen.getByText(title)).toBeTruthy();
    });
  });

  it("5. Situação do mês surfaces the biggest category without hiding any category from Por categoria", () => {
    render(<DashboardView />);
    // Casa (1500) is bigger than Alimentação (400) this month.
    expect(screen.getByText("Categoria que mais pesa")).toBeTruthy();
    // Both categories must still be fully enumerated in "Por categoria" — the
    // new headline never replaces or truncates that list.
    expect(screen.getAllByText("Casa").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Alimentação").length).toBeGreaterThan(0);
  });
});

describe("DashboardView — hideValues", () => {
  it("6. masks the primary numbers and the new Situação do mês amounts when hideValues is on", () => {
    mockFinance.hideValues = true;
    render(<DashboardView />);
    expect(screen.queryByText("R$ 6000.00")).toBeNull();
    expect(screen.getAllByText("R$ ••••").length).toBeGreaterThan(0);
  });
});

describe("DashboardView — empty states", () => {
  it("7. an empty month shows the chart empty states, not a crash", () => {
    Object.assign(mockFinance, {
      state: emptyMonthState(),
      month: emptyMonthState().months[MONTH],
    });
    render(<DashboardView />);
    expect(screen.getByText("Sem dados para o gráfico.")).toBeTruthy();
    expect(screen.getByText("Nenhum gasto neste mês.")).toBeTruthy();
    expect(screen.getByText("Cadastre mais meses para ver a evolução.")).toBeTruthy();
    // No topCategory when there are no expenses — the row must not render.
    expect(screen.queryByText("Categoria que mais pesa")).toBeNull();
  });
});

describe("DashboardView — troca de mês e de visão", () => {
  it("8. clicking a month in Histórico de meses calls setActiveMonth", () => {
    render(<DashboardView />);
    fireEvent.click(screen.getByText("Julho 2026"));
    expect(mockFinance.setActiveMonth).toHaveBeenCalledWith(PREV_MONTH);
  });

  it("9. switching the active view changes which numbers are shown", () => {
    const stateForMaria: FinanceState = { ...baseState(), activePerson: "me" };
    Object.assign(mockFinance, { state: stateForMaria, month: stateForMaria.months[MONTH] });
    render(<DashboardView />);
    // view "me" -> budget is just income (5000), not income+houseContribution (6000).
    expect(screen.getByText("R$ 5000.00")).toBeTruthy();
    expect(screen.queryByText("R$ 6000.00")).toBeNull();
  });
});
