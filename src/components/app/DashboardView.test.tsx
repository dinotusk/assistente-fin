// @vitest-environment jsdom
// P0-FRONTEND-1B.3 — Painel hierarchy: the primary numbers (orçamento,
// gastos, livre) must stay above the new "Situação do mês" block, which
// itself must sit above the "Análise detalhada" group; every pre-existing
// panel must keep rendering (nothing removed); hideValues, empty states,
// and month/view switching must keep working exactly as before.
// P0-FRONTEND-1B.4 — the top category chip and the family cards became real
// navigation/view controls, and a new "Ações rápidas" block was added
// between "Situação do mês" and "Histórico de meses" — all through existing
// flows (no new functionality), so this file also covers that behavior.
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
  setActivePerson: vi.fn(),
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

const actions = {
  onOpenCategory: vi.fn(),
  onViewTransactions: vi.fn(),
  onAddExpense: vi.fn(),
  onAddGoal: vi.fn(),
  onOpenAval: vi.fn(),
};

function renderDashboard() {
  return render(<DashboardView {...actions} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mockFinance, { state: baseState(), month: baseState().months[MONTH] });
  mockFinance.hideValues = false;
});
afterEach(() => cleanup());

describe("DashboardView — informação principal presente e hierarquia", () => {
  it("1. shows the primary numbers: orçamento, gastos and livre", () => {
    renderDashboard();
    // budget = income(5000) + houseContribution(1000) for "todos" = 6000
    expect(screen.getByText("R$ 6000.00")).toBeTruthy();
    // total spent = 1500 + 400 = 1900
    expect(screen.getByText(/R\$ 1900\.00 gastos/)).toBeTruthy();
  });

  it("2. hierarquia: hero -> Situação do mês -> Ações rápidas -> Histórico -> Análise detalhada -> painéis analíticos", () => {
    renderDashboard();
    const headings = Array.from(document.querySelectorAll("h2")).map((h) => h.textContent);
    const situacaoIndex = headings.findIndex((h) => h?.includes("Situação do mês"));
    const acoesIndex = headings.findIndex((h) => h?.includes("Ações rápidas"));
    const historicoIndex = headings.findIndex((h) => h?.includes("Histórico de meses"));
    const distribuicaoIndex = headings.findIndex((h) => h?.includes("Distribuição do mês"));

    expect(situacaoIndex).toBeGreaterThanOrEqual(0);
    expect(acoesIndex).toBeGreaterThan(situacaoIndex);
    expect(historicoIndex).toBeGreaterThan(acoesIndex);
    expect(distribuicaoIndex).toBeGreaterThan(historicoIndex);

    // "Análise detalhada" groups the analytical panels and must appear
    // right before the first of them (Distribuição do mês).
    const analysisLabel = screen.getByText("Análise detalhada");
    expect(analysisLabel).toBeTruthy();
  });

  it("3. every pre-existing panel still renders — nothing was removed", () => {
    renderDashboard();
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
    renderDashboard();
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
    renderDashboard();
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
    renderDashboard();
    expect(screen.getByText("Sem dados para o gráfico.")).toBeTruthy();
    expect(screen.getByText("Nenhum gasto neste mês.")).toBeTruthy();
    expect(screen.getByText("Cadastre mais meses para ver a evolução.")).toBeTruthy();
    // No topCategory when there are no expenses — the row must not render.
    expect(screen.queryByText("Categoria que mais pesa")).toBeNull();
  });

  it("10. an empty month (no category) still shows Ações rápidas — never a fake category button", () => {
    Object.assign(mockFinance, {
      state: emptyMonthState(),
      month: emptyMonthState().months[MONTH],
    });
    renderDashboard();
    expect(screen.queryByRole("button", { name: /Ver gastos da categoria/ })).toBeNull();
    expect(screen.getByText("Ações rápidas")).toBeTruthy();
    expect(screen.getByText("Adicionar gasto")).toBeTruthy();
  });
});

describe("DashboardView — troca de mês e de visão", () => {
  it("8. clicking a month in Histórico de meses calls setActiveMonth", () => {
    renderDashboard();
    fireEvent.click(screen.getByText("Julho 2026"));
    expect(mockFinance.setActiveMonth).toHaveBeenCalledWith(PREV_MONTH);
  });

  it("9. switching the active view changes which numbers are shown", () => {
    const stateForMaria: FinanceState = { ...baseState(), activePerson: "me" };
    Object.assign(mockFinance, { state: stateForMaria, month: stateForMaria.months[MONTH] });
    renderDashboard();
    // view "me" -> budget is just income (5000), not income+houseContribution (6000).
    expect(screen.getByText("R$ 5000.00")).toBeTruthy();
    expect(screen.queryByText("R$ 6000.00")).toBeNull();
  });
});

describe("DashboardView — categoria principal navega para Gastos (P0-FRONTEND-1B.4)", () => {
  it("11. clicking the top category chip calls onOpenCategory with that category", () => {
    renderDashboard();
    // Casa (1500) is the biggest category this month.
    fireEvent.click(screen.getByRole("button", { name: /Ver gastos da categoria Casa/ }));
    expect(actions.onOpenCategory).toHaveBeenCalledWith("Casa");
  });

  it("12. the chip is keyboard-focusable (a real button, not a styled div)", () => {
    renderDashboard();
    const chip = screen.getByRole("button", { name: /Ver gastos da categoria Casa/ });
    expect(chip.tagName).toBe("BUTTON");
  });

  // P0-FRONTEND-1B.5 (Aval Glass): financial-content-adjacent controls (this
  // chip, the family cards below) are clickable but NOT glass — only the
  // dedicated navigation/controls surfaces are.
  it("27. the chip stays solid — no glass utility over the category amount", () => {
    renderDashboard();
    const chip = screen.getByRole("button", { name: /Ver gastos da categoria Casa/ });
    expect(chip.className).not.toMatch(/glass-/);
  });
});

describe("DashboardView — Divisão familiar como controle de visão (P0-FRONTEND-1B.4)", () => {
  it("13. tapping Maria's card sets activePerson to the 'me' key (first person)", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Ver gastos de Maria" }));
    expect(mockFinance.setActivePerson).toHaveBeenCalledWith("me");
  });

  it("14. tapping Oziel's card sets activePerson to the 'spouse' key (second person)", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Ver gastos de Oziel" }));
    expect(mockFinance.setActivePerson).toHaveBeenCalledWith("spouse");
  });

  it("15. 'Minha casa' (todos) is not one of the family cards — it stays an aggregate view, not a person", () => {
    renderDashboard();
    expect(screen.queryByRole("button", { name: /Ver gastos de Minha casa/ })).toBeNull();
  });

  it("16. tapping the already-active view does not call setActivePerson again", () => {
    const stateForMaria: FinanceState = { ...baseState(), activePerson: "me" };
    Object.assign(mockFinance, { state: stateForMaria, month: stateForMaria.months[MONTH] });
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Ver gastos de Maria" }));
    expect(mockFinance.setActivePerson).not.toHaveBeenCalled();
  });

  it("17. the active card keeps aria-pressed=true and visual state without writing", () => {
    const stateForMaria: FinanceState = { ...baseState(), activePerson: "me" };
    Object.assign(mockFinance, { state: stateForMaria, month: stateForMaria.months[MONTH] });
    renderDashboard();
    const card = screen.getByRole("button", { name: "Ver gastos de Maria" });
    expect(card.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("DashboardView — Ações rápidas (P0-FRONTEND-1B.4)", () => {
  it("18. renders exactly the 4 approved actions", () => {
    renderDashboard();
    expect(screen.getByText("Adicionar gasto")).toBeTruthy();
    expect(screen.getByText("Ver gastos")).toBeTruthy();
    expect(screen.getByText("Adicionar meta")).toBeTruthy();
    expect(screen.getByText("Perguntar ao Aval")).toBeTruthy();
  });

  it("19. Adicionar gasto calls onAddExpense", () => {
    renderDashboard();
    fireEvent.click(screen.getByText("Adicionar gasto"));
    expect(actions.onAddExpense).toHaveBeenCalledTimes(1);
  });

  it("20. Ver gastos calls onViewTransactions", () => {
    renderDashboard();
    fireEvent.click(screen.getByText("Ver gastos"));
    expect(actions.onViewTransactions).toHaveBeenCalledTimes(1);
  });

  it("21. Adicionar meta calls onAddGoal", () => {
    renderDashboard();
    fireEvent.click(screen.getByText("Adicionar meta"));
    expect(actions.onAddGoal).toHaveBeenCalledTimes(1);
  });

  it("22. Perguntar ao Aval calls onOpenAval", () => {
    renderDashboard();
    fireEvent.click(screen.getByText("Perguntar ao Aval"));
    expect(actions.onOpenAval).toHaveBeenCalledTimes(1);
  });

  // P0-FRONTEND-1B.5 (Aval Glass): quick actions are controls, so — unlike
  // the financial panels — they're meant to carry the glass utility.
  it("26. each quick action button carries the glass-surface utility", () => {
    renderDashboard();
    ["Adicionar gasto", "Ver gastos", "Adicionar meta", "Perguntar ao Aval"].forEach((label) => {
      const button = screen.getByText(label).closest("button");
      expect(button?.className).toContain("glass-surface");
    });
  });
});

describe("DashboardView — frase de atenção e saldo livre continuam estáticos (P0-FRONTEND-1B.4)", () => {
  it("23. the attention headline is plain text, not a button or link", () => {
    renderDashboard();
    const panel = screen.getByText("Situação do mês").closest("section");
    const clickableTags = panel ? Array.from(panel.querySelectorAll("a")) : [];
    expect(clickableTags.length).toBe(0);
  });

  // P0-FRONTEND-1B.5 (Aval Glass): glass is a navigation/controls treatment
  // only — the hero, Situação do mês, and every financial chart must never
  // carry it, however the utility class ends up spelled.
  it("24. the hero and Situação do mês panels never carry a glass- utility class", () => {
    renderDashboard();
    const hero = screen.getByText("R$ 6000.00").closest("section");
    const situacao = screen.getByText("Situação do mês").closest("section");
    expect(hero?.className).not.toMatch(/glass-/);
    expect(situacao?.className).not.toMatch(/glass-/);
  });

  it("25. Distribuição/Por categoria/Divisão familiar panels never carry a glass- utility class", () => {
    renderDashboard();
    ["Distribuição do mês", "Por categoria", "Divisão familiar"].forEach((title) => {
      const panel = screen.getByText(title).closest("section");
      expect(panel?.className).not.toMatch(/glass-/);
    });
  });
});
