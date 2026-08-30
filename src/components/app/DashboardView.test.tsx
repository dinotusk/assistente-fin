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
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Scopes queries to the Movimentações recentes panel — its rows can repeat
    text/amounts already shown in Situação do mês (e.g. a single-expense
    category), so tests must not assume page-wide uniqueness. */
function recentMovementsPanel() {
  const panel = screen.getByText("Movimentações recentes").closest("section");
  if (!panel) throw new Error("Movimentações recentes panel not found");
  return within(panel);
}

/** Scopes queries to the new P9.1 hero — its Comprometido/Disponível figures
    can numerically repeat elsewhere on the page (Movimentações, Situação do
    mês, Divisão familiar, Histórico de meses all show real amounts too), so
    tests must not assume page-wide uniqueness of a money string. */
function heroSection() {
  const section = screen.getByText("Seu mês").closest("section");
  if (!section) throw new Error("Hero section not found");
  return within(section);
}

/** Scopes queries to the P9.1 "Progresso do mês" card — same repetition risk. */
function progressCard() {
  const card = screen.getByText("Progresso do mês").closest("section");
  if (!card) throw new Error("Progresso do mês card not found");
  return within(card);
}

/** Scopes queries to the whole P9.2 "Divisão da casa" panel. */
function divisaoDaCasaPanel() {
  const panel = screen.getByText("Divisão da casa").closest("section");
  if (!panel) throw new Error("Divisão da casa panel not found");
  return within(panel);
}

/** Scopes queries to one profile's own card inside "Divisão da casa" — each
    card repeats the same "Disponível"/"Comprometido"/"Livre" labels, so
    per-profile assertions must never read from the page/panel at large. */
function familySplitCard(name: string) {
  const card = screen.getByRole("button", { name: `Ver detalhes financeiros de ${name}` });
  return within(card);
}

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
  onEditExpense: vi.fn(),
  onEditPeople: vi.fn(),
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
  it("1. shows the primary numbers: disponível (orçamento), comprometido and livre", () => {
    renderDashboard();
    const hero = heroSection();
    // budget = income(5000) + houseContribution(1000) for "todos" = 6000
    expect(hero.getByText("R$ 6000.00")).toBeTruthy();
    // total spent (comprometido) = 1500 + 400 = 1900
    expect(hero.getByText("R$ 1900.00")).toBeTruthy();
    // free (livre) = 6000 - 1900 = 4100
    expect(hero.getByText("R$ 4100.00")).toBeTruthy();
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

// P9.1 — new financial hero (Disponível/Comprometido/Livre) + Progresso do mês
// (Pago/Falta pagar + bar). Every value comes straight from calc()/
// budgetForView() — no parallel calculation is introduced or tested here.
describe("DashboardView — P9.1 hero financeiro e progresso do mês", () => {
  it("1. renders Disponível (budget)", () => {
    renderDashboard();
    // "Disponível"/"Comprometido"/"Livre" also label each P9.2 per-profile
    // card, so scope to the hero specifically.
    expect(heroSection().getByText("Disponível")).toBeTruthy();
    expect(heroSection().getByText("R$ 6000.00")).toBeTruthy();
  });

  it("2. renders Comprometido (total)", () => {
    renderDashboard();
    expect(heroSection().getByText("Comprometido")).toBeTruthy();
    expect(heroSection().getByText("R$ 1900.00")).toBeTruthy();
  });

  it("3. renders Livre (free) with strong visual weight (its own text-[2.1rem] figure)", () => {
    renderDashboard();
    expect(heroSection().getByText("Livre")).toBeTruthy();
    const livre = heroSection().getByText("R$ 4100.00");
    expect(livre.className).toContain("text-[2.1rem]");
  });

  it("4. renders Pago (calc().paid) in the Progresso do mês card", () => {
    renderDashboard();
    // "Pago" also appears as a StatusPill label elsewhere (Movimentações), so
    // scope to the Progresso do mês card, which has exactly one "Pago" label.
    expect(progressCard().getByText("Pago")).toBeTruthy();
    // paid = Mercado (400, status Pago)
    expect(progressCard().getByText("R$ 400.00")).toBeTruthy();
  });

  it("5. renders Falta pagar (calc().pending) in the Progresso do mês card", () => {
    renderDashboard();
    expect(screen.getByText("Falta pagar")).toBeTruthy();
    // pending = Aluguel (1500, status A pagar)
    expect(progressCard().getByText("R$ 1500.00")).toBeTruthy();
  });

  it("6. switching the active month updates every hero/progress value", () => {
    renderDashboard();
    expect(heroSection().getByText("R$ 6000.00")).toBeTruthy(); // August budget

    const prevMonthState: FinanceState = { ...baseState(), activeMonth: PREV_MONTH };
    Object.assign(mockFinance, { state: prevMonthState, month: baseState().months[PREV_MONTH] });
    cleanup();
    renderDashboard();
    // July: budget = 5000 + 1000 = 6000 (same total, different composition is
    // irrelevant here) but total/paid/pending must reflect July's single
    // expense (Mercado, 100, Pago) instead of August's.
    expect(heroSection().getByText("R$ 100.00")).toBeTruthy(); // comprometido
    expect(progressCard().getByText("R$ 100.00")).toBeTruthy(); // pago (same expense, already paid)
    expect(progressCard().getByText("R$ 0.00")).toBeTruthy(); // falta pagar — nothing pending in July
  });

  it("7. switching Minha casa -> Maria updates the hero/progress values to Maria's scope only", () => {
    const stateForMaria: FinanceState = { ...baseState(), activePerson: "me" };
    Object.assign(mockFinance, { state: stateForMaria, month: stateForMaria.months[MONTH] });
    renderDashboard();
    // Maria's budget is just income (5000), not income+houseContribution (6000).
    expect(heroSection().getByText("R$ 5000.00")).toBeTruthy();
    expect(heroSection().queryByText("R$ 6000.00")).toBeNull();
    // Maria's only expense this month is Aluguel (1500, A pagar) — comprometido
    // and falta pagar both read 1500; pago reads 0.
    expect(heroSection().getByText("R$ 1500.00")).toBeTruthy();
    expect(progressCard().getByText("R$ 1500.00")).toBeTruthy();
    expect(progressCard().getByText("R$ 0.00")).toBeTruthy();
  });

  it("8. hideValues masks Disponível, Comprometido, Livre, Pago and Falta pagar", () => {
    mockFinance.hideValues = true;
    renderDashboard();
    const hero = heroSection();
    const progress = progressCard();
    expect(hero.queryByText("R$ 6000.00")).toBeNull();
    expect(hero.queryByText("R$ 1900.00")).toBeNull();
    expect(hero.queryByText("R$ 4100.00")).toBeNull();
    expect(progress.queryByText("R$ 400.00")).toBeNull();
    expect(progress.queryByText("R$ 1500.00")).toBeNull();
    expect(hero.getAllByText("R$ ••••").length).toBe(3);
    expect(progress.getAllByText("R$ ••••").length).toBe(2);
  });

  it("9. paid=0 renders R$ 0.00 without crashing, bar stays empty", () => {
    const noPaidState: FinanceState = {
      people: ["Maria"],
      activePerson: "todos",
      activeMonth: MONTH,
      months: {
        [MONTH]: {
          label: "Agosto 2026",
          income: 3000,
          houseContribution: 0,
          expenses: [
            {
              id: "e1",
              name: "Aluguel",
              category: "Casa",
              amount: 1000,
              status: "A pagar",
              owner: "Maria",
              date: `${MONTH}-05`,
              paymentMethod: "Pix",
              note: "",
            },
          ],
          priorities: [],
        },
      },
    };
    Object.assign(mockFinance, { state: noPaidState, month: noPaidState.months[MONTH] });
    renderDashboard();
    expect(progressCard().getByText("R$ 0.00")).toBeTruthy(); // pago
    const bar = screen.getByRole("progressbar", { name: "Proporção já paga no mês" });
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });

  it("10. pending=0 renders R$ 0.00 without crashing, bar fills 100%", () => {
    const noPendingState: FinanceState = {
      people: ["Maria"],
      activePerson: "todos",
      activeMonth: MONTH,
      months: {
        [MONTH]: {
          label: "Agosto 2026",
          income: 3000,
          houseContribution: 0,
          expenses: [
            {
              id: "e1",
              name: "Mercado",
              category: "Alimentação",
              amount: 200,
              status: "Pago",
              owner: "Maria",
              date: `${MONTH}-05`,
              paymentMethod: "Pix",
              note: "",
            },
          ],
          priorities: [],
        },
      },
    };
    Object.assign(mockFinance, { state: noPendingState, month: noPendingState.months[MONTH] });
    renderDashboard();
    const bar = screen.getByRole("progressbar", { name: "Proporção já paga no mês" });
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("100%");
  });

  it("11. paid+pending=0 (no expenses at all) renders a neutral, empty bar — never NaN/Infinity", () => {
    Object.assign(mockFinance, {
      state: emptyMonthState(),
      month: emptyMonthState().months[MONTH],
    });
    renderDashboard();
    const bar = screen.getByRole("progressbar", { name: "Proporção já paga no mês" });
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("0%");
    expect(screen.queryByText("NaN")).toBeNull();
    expect(screen.queryByText(/Infinity/)).toBeNull();
  });

  it("12. an over-budget month keeps Livre negative and destructive-colored — same semantics as before", () => {
    const overBudgetState: FinanceState = {
      people: ["Maria"],
      activePerson: "todos",
      activeMonth: MONTH,
      months: {
        [MONTH]: {
          label: "Agosto 2026",
          income: 1000,
          houseContribution: 0,
          expenses: [
            {
              id: "e1",
              name: "Aluguel",
              category: "Casa",
              amount: 1500,
              status: "A pagar",
              owner: "Maria",
              date: `${MONTH}-05`,
              paymentMethod: "Pix",
              note: "",
            },
          ],
          priorities: [],
        },
      },
    };
    Object.assign(mockFinance, { state: overBudgetState, month: overBudgetState.months[MONTH] });
    renderDashboard();
    // free = 1000 - 1500 = -500
    const livre = heroSection().getByText("R$ -500.00");
    expect(livre.className).toContain("text-destructive");
  });

  it("13. values >= 1000 are formatted through the existing money() formatter, not a parallel one", () => {
    renderDashboard();
    // Every hero/progress value here is already >= 1000 in the base fixture
    // (budget 6000, comprometido 1900) — asserting they render via the exact
    // shared `useMoney()` mock output proves no separate formatting path.
    expect(heroSection().getByText("R$ 6000.00")).toBeTruthy();
    expect(heroSection().getByText("R$ 1900.00")).toBeTruthy();
  });

  it("14. a large value does not overflow into a broken/garbled string", () => {
    const bigState: FinanceState = {
      people: ["Maria"],
      activePerson: "todos",
      activeMonth: MONTH,
      months: {
        [MONTH]: {
          label: "Agosto 2026",
          income: 1_250_000,
          houseContribution: 0,
          expenses: [
            {
              id: "e1",
              name: "Aluguel",
              category: "Casa",
              amount: 50_000,
              status: "A pagar",
              owner: "Maria",
              date: `${MONTH}-05`,
              paymentMethod: "Pix",
              note: "",
            },
          ],
          priorities: [],
        },
      },
    };
    Object.assign(mockFinance, { state: bigState, month: bigState.months[MONTH] });
    renderDashboard();
    expect(heroSection().getByText("R$ 1250000.00")).toBeTruthy(); // disponível
    expect(heroSection().getByText("R$ 50000.00")).toBeTruthy(); // comprometido
    expect(heroSection().getByText("R$ 1200000.00")).toBeTruthy(); // livre
    expect(progressCard().getByText("R$ 50000.00")).toBeTruthy(); // falta pagar
  });

  it("15. the old compact hero (budget + '{total} gastos · {livre}' single line) is gone — no duplication with the new hero", () => {
    renderDashboard();
    expect(screen.queryByText(/gastos ·/)).toBeNull();
    expect(screen.queryByText(/livre$/)).toBeNull();
    expect(screen.queryByText(/acima$/)).toBeNull();
    // Exactly one "Livre" label inside the hero itself (P9.2's per-profile
    // cards elsewhere on the page also say "Livre" — that's a different,
    // intentional block, not old-hero duplication).
    expect(heroSection().getAllByText("Livre").length).toBe(1);
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
    // Also rendered by Movimentações recentes' own empty state (P0-DASHBOARD-REFINE).
    expect(screen.getAllByText("Adicionar gasto").length).toBeGreaterThan(0);
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

  // P0-FRONTEND-1B.7 — "Perguntar ao Aval" uses the real brand mark, not a
  // generic sparkles icon; the other three actions keep their lucide icons.
  it("28. Perguntar ao Aval renders the Aval brand mark", () => {
    renderDashboard();
    const button = screen.getByText("Perguntar ao Aval").closest("button");
    const svg = button?.querySelector("svg");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 32 32");
  });

  it("29. the other quick actions keep a generic lucide icon (24x24 viewBox)", () => {
    renderDashboard();
    ["Adicionar gasto", "Ver gastos", "Adicionar meta"].forEach((label) => {
      const button = screen.getByText(label).closest("button");
      const svg = button?.querySelector("svg");
      expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    });
  });
});

describe("DashboardView — Movimentações recentes (P0-DASHBOARD-REFINE)", () => {
  it("30. shows real fixture rows — name, category, date and amount, most recent first", () => {
    renderDashboard();
    // exp-1 (05/08) is more recent than exp-2 (03/08); both must appear.
    const panel = recentMovementsPanel();
    expect(panel.getByText("Aluguel")).toBeTruthy();
    expect(panel.getByText("Mercado")).toBeTruthy();
    expect(panel.getByText("R$ 1500.00")).toBeTruthy();
    expect(panel.getByText("R$ 400.00")).toBeTruthy();
    const names = panel.getAllByText(/^(Aluguel|Mercado)$/).map((el) => el.textContent);
    expect(names.indexOf("Aluguel")).toBeLessThan(names.indexOf("Mercado"));
  });

  it("31. never shows more than the defined limit (5), even with more expenses", () => {
    const manyExpensesState: FinanceState = {
      people: ["Maria"],
      activePerson: "todos",
      activeMonth: MONTH,
      months: {
        [MONTH]: {
          label: "Agosto 2026",
          income: 5000,
          houseContribution: 0,
          expenses: Array.from({ length: 7 }, (_, i) => ({
            id: `many-${i}`,
            name: `Gasto ${i}`,
            category: "Outros",
            amount: 10 + i,
            status: "Pago" as const,
            owner: "Maria",
            date: `${MONTH}-${String(i + 1).padStart(2, "0")}`,
            paymentMethod: "Pix",
            note: "",
          })),
          priorities: [],
        },
      },
    };
    Object.assign(mockFinance, {
      state: manyExpensesState,
      month: manyExpensesState.months[MONTH],
    });
    renderDashboard();
    expect(screen.getAllByRole("button", { name: /^Editar gasto/ }).length).toBe(5);
    // The 5 most recent by date (i=6..2), not the 5 oldest.
    expect(screen.getByText("Gasto 6")).toBeTruthy();
    expect(screen.queryByText("Gasto 0")).toBeNull();
  });

  it("32. respects activeMonth — switching month changes which movements appear", () => {
    const prevMonthState: FinanceState = { ...baseState(), activeMonth: PREV_MONTH };
    Object.assign(mockFinance, {
      state: prevMonthState,
      month: baseState().months[PREV_MONTH],
    });
    renderDashboard();
    // Only July's single expense — never August's Aluguel.
    expect(recentMovementsPanel().getByText("R$ 100.00")).toBeTruthy();
    expect(screen.queryByText("Aluguel")).toBeNull();
  });

  it("33. respects activePerson — 'me' (Maria) only shows Maria's movements", () => {
    const stateForMaria: FinanceState = { ...baseState(), activePerson: "me" };
    Object.assign(mockFinance, { state: stateForMaria, month: stateForMaria.months[MONTH] });
    renderDashboard();
    expect(screen.getByText("Aluguel")).toBeTruthy(); // owner Maria
    expect(screen.queryByText("Mercado")).toBeNull(); // owner Oziel
  });

  it("34. 'Minha casa' (todos) shows movements from every person", () => {
    renderDashboard(); // default fixture activePerson is "todos"
    expect(screen.getByText("Aluguel")).toBeTruthy();
    expect(screen.getByText("Mercado")).toBeTruthy();
  });

  it("35. hideValues masks the movement amounts", () => {
    mockFinance.hideValues = true;
    renderDashboard();
    expect(screen.queryByText("R$ 1500.00")).toBeNull();
    expect(screen.getAllByText("R$ ••••").length).toBeGreaterThan(0);
  });

  it("36. 'Ver todas' calls onViewTransactions — the same navigation Ações rápidas already uses", () => {
    renderDashboard();
    fireEvent.click(screen.getByText("Ver todas"));
    expect(actions.onViewTransactions).toHaveBeenCalledTimes(1);
  });

  it("37. clicking a movement calls onEditExpense with that expense's id — reuses the existing ExpenseDialog, not a new one", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Editar gasto Aluguel" }));
    expect(actions.onEditExpense).toHaveBeenCalledWith("exp-1");
  });

  it("38. empty month shows a simple empty state, not fake rows", () => {
    Object.assign(mockFinance, {
      state: emptyMonthState(),
      month: emptyMonthState().months[MONTH],
    });
    renderDashboard();
    expect(screen.getByText("Nenhuma movimentação neste mês")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Editar gasto/ })).toBeNull();
  });

  it("39. the empty-state 'Adicionar gasto' button reuses the existing add-expense flow", () => {
    Object.assign(mockFinance, {
      state: emptyMonthState(),
      month: emptyMonthState().months[MONTH],
    });
    renderDashboard();
    const emptyStateButtons = screen.getAllByText("Adicionar gasto");
    fireEvent.click(emptyStateButtons[emptyStateButtons.length - 1]);
    expect(actions.onAddExpense).toHaveBeenCalled();
  });

  it("40. every movement row is a real, keyboard-focusable button with an accessible name", () => {
    renderDashboard();
    const row = screen.getByRole("button", { name: "Editar gasto Aluguel" });
    expect(row.tagName).toBe("BUTTON");
  });

  it("41. Movimentações recentes stays solid — no glass utility, financial content prioritizes legibility", () => {
    renderDashboard();
    const panel = screen.getByText("Movimentações recentes").closest("section");
    expect(panel?.className).not.toMatch(/glass-/);
    const row = screen.getByRole("button", { name: "Editar gasto Aluguel" });
    expect(row.className).not.toMatch(/glass-/);
  });

  it("42. Movimentações recentes doesn't replace any pre-existing panel", () => {
    renderDashboard();
    [
      "Situação do mês",
      "Ações rápidas",
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

  it("43. Situação do mês, Ações rápidas and Movimentações recentes share a two-column grid wrapper at desktop (lg:), single column below", () => {
    renderDashboard();
    const wrapper = screen.getByText("Situação do mês").closest("section")
      ?.parentElement?.parentElement;
    expect(wrapper?.className).toContain("lg:grid-cols-2");
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

// P9.2 — "Divisão da casa": one card per active profile in VIEW_ALL, each
// reading calc()/budgetForView() for that profile's own view — no new
// financial rule, same functions the hero already uses, called once per
// profile instead of once for the active view.
describe("DashboardView — P9.2 Divisão da casa", () => {
  it("1. VIEW_ALL + 2 perfis -> bloco aparece", () => {
    renderDashboard();
    expect(screen.getByText("Divisão da casa")).toBeTruthy();
  });

  it("2. renders one card per profile", () => {
    renderDashboard();
    expect(screen.getByRole("button", { name: "Ver detalhes financeiros de Maria" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ver detalhes financeiros de Oziel" })).toBeTruthy();
  });

  it("3. names come from state.people — no hardcoded name", () => {
    const renamedState: FinanceState = {
      ...baseState(),
      people: ["Ana", "Pedro"],
      months: {
        [MONTH]: {
          ...baseState().months[MONTH],
          expenses: baseState().months[MONTH].expenses.map((e) => ({
            ...e,
            owner: e.owner === "Maria" ? "Ana" : "Pedro",
          })),
        },
      },
    };
    Object.assign(mockFinance, { state: renamedState, month: renamedState.months[MONTH] });
    renderDashboard();
    expect(screen.getByRole("button", { name: "Ver detalhes financeiros de Ana" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ver detalhes financeiros de Pedro" })).toBeTruthy();
    expect(screen.queryByText("Maria")).toBeNull();
    expect(screen.queryByText("Oziel")).toBeNull();
  });

  it("4. and 11. clicking profile 0's card sets activePerson to 'me' (VIEW_ME)", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Ver detalhes financeiros de Maria" }));
    expect(mockFinance.setActivePerson).toHaveBeenCalledWith("me");
  });

  it("5. and 12. clicking profile 1's card sets activePerson to 'spouse' (VIEW_SPOUSE)", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Ver detalhes financeiros de Oziel" }));
    expect(mockFinance.setActivePerson).toHaveBeenCalledWith("spouse");
  });

  it("6. and 13. and 18. a third profile renders and uses its own literal name as the view", () => {
    const threePeopleState: FinanceState = {
      people: ["Maria", "Oziel", "Vovó"],
      activePerson: "todos",
      activeMonth: MONTH,
      months: {
        [MONTH]: {
          label: "Agosto 2026",
          income: 5000,
          houseContribution: 1000,
          profileBudgets: { Vovó: 500 },
          expenses: [
            {
              id: "e1",
              name: "Remédio",
              category: "Saúde",
              amount: 200,
              status: "A pagar",
              owner: "Vovó",
              date: `${MONTH}-05`,
              paymentMethod: "Pix",
              note: "",
            },
          ],
          priorities: [],
        },
      },
    };
    Object.assign(mockFinance, { state: threePeopleState, month: threePeopleState.months[MONTH] });
    renderDashboard();
    expect(screen.getByRole("button", { name: "Ver detalhes financeiros de Maria" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ver detalhes financeiros de Oziel" })).toBeTruthy();
    const vovoCard = screen.getByRole("button", { name: "Ver detalhes financeiros de Vovó" });
    expect(vovoCard).toBeTruthy();
    fireEvent.click(vovoCard);
    expect(mockFinance.setActivePerson).toHaveBeenCalledWith("Vovó");
  });

  it("7. 8. 9. and 10. each card shows its own budget/comprometido/livre — never another profile's numbers", () => {
    renderDashboard();
    const maria = familySplitCard("Maria");
    // Maria (VIEW_ME): budget=income=5000, total=1500 (Aluguel), free=3500
    expect(maria.getByText("R$ 5000.00")).toBeTruthy();
    expect(maria.getByText("R$ 1500.00")).toBeTruthy();
    expect(maria.getByText("R$ 3500.00")).toBeTruthy();
    // Never Oziel's own numbers leaking into Maria's card.
    expect(maria.queryByText("R$ 1000.00")).toBeNull();
    expect(maria.queryByText("R$ 400.00")).toBeNull();
    expect(maria.queryByText("R$ 600.00")).toBeNull();

    const oziel = familySplitCard("Oziel");
    // Oziel (VIEW_SPOUSE): budget=houseContribution=1000, total=400 (Mercado), free=600
    expect(oziel.getByText("R$ 1000.00")).toBeTruthy();
    expect(oziel.getByText("R$ 400.00")).toBeTruthy();
    expect(oziel.getByText("R$ 600.00")).toBeTruthy();
    expect(oziel.queryByText("R$ 5000.00")).toBeNull();
    expect(oziel.queryByText("R$ 1500.00")).toBeNull();
    expect(oziel.queryByText("R$ 3500.00")).toBeNull();
  });

  it("14. VIEW_ME -> bloco ausente", () => {
    const stateForMaria: FinanceState = { ...baseState(), activePerson: "me" };
    Object.assign(mockFinance, { state: stateForMaria, month: stateForMaria.months[MONTH] });
    renderDashboard();
    expect(screen.queryByText("Divisão da casa")).toBeNull();
  });

  it("15. VIEW_SPOUSE -> bloco ausente", () => {
    const stateForOziel: FinanceState = { ...baseState(), activePerson: "spouse" };
    Object.assign(mockFinance, { state: stateForOziel, month: stateForOziel.months[MONTH] });
    renderDashboard();
    expect(screen.queryByText("Divisão da casa")).toBeNull();
  });

  it("16. a specific-profile view -> bloco ausente", () => {
    const stateForVovo: FinanceState = { ...baseState(), activePerson: "Oziel" };
    Object.assign(mockFinance, { state: stateForVovo, month: stateForVovo.months[MONTH] });
    renderDashboard();
    expect(screen.queryByText("Divisão da casa")).toBeNull();
  });

  it("17. only 1 profile -> bloco ausente (no redundant repeat of the hero)", () => {
    Object.assign(mockFinance, {
      state: emptyMonthState(),
      month: emptyMonthState().months[MONTH],
    });
    renderDashboard();
    expect(screen.queryByText("Divisão da casa")).toBeNull();
  });

  it("19. hideValues masks every profile's Disponível/Comprometido/Livre", () => {
    mockFinance.hideValues = true;
    renderDashboard();
    const maria = familySplitCard("Maria");
    const oziel = familySplitCard("Oziel");
    expect(maria.queryByText("R$ 5000.00")).toBeNull();
    expect(maria.queryByText("R$ 1500.00")).toBeNull();
    expect(maria.queryByText("R$ 3500.00")).toBeNull();
    expect(oziel.queryByText("R$ 1000.00")).toBeNull();
    expect(maria.getAllByText("R$ ••••").length).toBe(3);
    expect(oziel.getAllByText("R$ ••••").length).toBe(3);
  });

  it("20. a profile over its own budget renders a negative Livre without crashing", () => {
    const overBudgetProfileState: FinanceState = {
      people: ["Maria", "Oziel"],
      activePerson: "todos",
      activeMonth: MONTH,
      months: {
        [MONTH]: {
          label: "Agosto 2026",
          income: 100,
          houseContribution: 1000,
          expenses: [
            {
              id: "e1",
              name: "Aluguel",
              category: "Casa",
              amount: 1500,
              status: "A pagar",
              owner: "Maria",
              date: `${MONTH}-05`,
              paymentMethod: "Pix",
              note: "",
            },
          ],
          priorities: [],
        },
      },
    };
    Object.assign(mockFinance, {
      state: overBudgetProfileState,
      month: overBudgetProfileState.months[MONTH],
    });
    renderDashboard();
    // Maria: budget=100, total=1500, free=-1400
    const maria = familySplitCard("Maria");
    const livre = maria.getByText("R$ -1400.00");
    expect(livre.className).toContain("text-destructive");
  });

  it("21. a long profile name doesn't break the card structure (truncate class present)", () => {
    const longNameState: FinanceState = {
      ...baseState(),
      people: ["Maria Fernanda de Alcântara Rodrigues", "Oziel"],
      months: {
        [MONTH]: {
          ...baseState().months[MONTH],
          expenses: baseState().months[MONTH].expenses.map((e) => ({
            ...e,
            owner: e.owner === "Maria" ? "Maria Fernanda de Alcântara Rodrigues" : e.owner,
          })),
        },
      },
    };
    Object.assign(mockFinance, { state: longNameState, month: longNameState.months[MONTH] });
    renderDashboard();
    const card = familySplitCard("Maria Fernanda de Alcântara Rodrigues");
    const nameEl = card.getByText("Maria Fernanda de Alcântara Rodrigues");
    expect(nameEl.className).toContain("truncate");
  });

  it("22. there is no redundant aggregate 'Minha casa' card inside Divisão da casa", () => {
    renderDashboard();
    expect(
      screen.queryByRole("button", { name: "Ver detalhes financeiros de Minha casa" }),
    ).toBeNull();
    // Exactly 2 profile cards for the 2-person base fixture — not a 3rd "casa"
    // one (the panel's own "Editar nomes" button is excluded by name filter).
    const panel = divisaoDaCasaPanel();
    const profileCards = panel
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-label")?.startsWith("Ver detalhes financeiros de"));
    expect(profileCards.length).toBe(2);
  });

  it("23. 'Editar nomes' opens the existing PeopleDialog via the passed-in callback", () => {
    renderDashboard();
    fireEvent.click(screen.getByText("Editar nomes"));
    expect(actions.onEditPeople).toHaveBeenCalledTimes(1);
  });

  it("24. no parallel persistence logic exists — DashboardView never renders a dialog of its own", () => {
    renderDashboard();
    fireEvent.click(screen.getByText("Editar nomes"));
    // DashboardView only calls the callback; the actual PeopleDialog/savePeople
    // flow lives in AppHome/FinanceContext, never duplicated here.
    expect(screen.queryByText("Perfis financeiros")).toBeNull();
  });
});
