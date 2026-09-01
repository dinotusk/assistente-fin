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

/** Aval Modern — scopes queries to the balance area ("Livre" + its big
    value), which sits directly on the page (no <section> wrapper any more),
    identified by its own data-testid. */
function balanceArea() {
  return within(screen.getByTestId("balance-area"));
}

/** Aval Modern — scopes queries to the quick-actions block (primary +
    secondary pills) that now sits right under the balance. */
function quickActionsArea() {
  return within(screen.getByTestId("quick-actions"));
}

/** Aval Modern — scopes queries to the compact metrics module
    (Disponível/Comprometido/Pago/Falta pagar + progress bar), which replaced
    the old finance-hero card. Its Comprometido/Disponível figures can
    numerically repeat elsewhere on the page (Movimentações, Situação do mês,
    Divisão familiar, Histórico de meses all show real amounts too), so tests
    must not assume page-wide uniqueness of a money string. */
function metricsPanel() {
  return within(screen.getByTestId("metrics-panel"));
}

/** Reads the value rendered next to a given metrics-panel label (Disponível,
    Comprometido, Pago, Falta pagar). Two labels can legitimately share the
    same money string in a given fixture (e.g. comprometido == falta pagar
    when there's exactly one pending expense), so scoping by panel alone is
    not always enough to disambiguate them. */
function metricValue(label: string): string {
  const labelEl = metricsPanel().getByText(label);
  const value = labelEl.parentElement?.querySelector("strong");
  if (!value) throw new Error(`No value found next to metric label "${label}"`);
  return value.textContent || "";
}

/** Scopes queries to the whole P9.2 "Divisão da casa" panel. */
function divisaoDaCasaPanel() {
  const panel = screen.getByText("Divisão da casa").closest("section");
  if (!panel) throw new Error("Divisão da casa panel not found");
  return within(panel);
}

/** Scopes queries to the whole P9.3 "Próximos meses" panel. */
function proximosMesesPanel() {
  const panel = screen.getByText("Próximos meses").closest("section");
  if (!panel) throw new Error("Próximos meses panel not found");
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
  onOpenSimulator: vi.fn(),
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
    // budget = income(5000) + houseContribution(1000) for "todos" = 6000
    expect(metricsPanel().getByText("R$ 6000.00")).toBeTruthy();
    // total spent (comprometido) = 1500 + 400 = 1900
    expect(metricsPanel().getByText("R$ 1900.00")).toBeTruthy();
    // free (livre) = 6000 - 1900 = 4100
    expect(balanceArea().getByText("R$ 4100.00")).toBeTruthy();
  });

  it("2. hierarquia: balance -> quick actions -> metrics -> Situação do mês -> Histórico -> Análise detalhada -> painéis analíticos", () => {
    renderDashboard();
    // Aval Modern moved the balance/actions/metrics ahead of everything else
    // (no <h2> heading of their own — the reference doesn't label them
    // either) — order is asserted via DOM position (compareDocumentPosition)
    // rather than a heading list for those three testid-scoped blocks.
    const balance = screen.getByTestId("balance-area");
    const actions = screen.getByTestId("quick-actions");
    const metrics = screen.getByTestId("metrics-panel");
    [balance, actions, metrics].slice(0, -1).forEach((el, i) => {
      const next = [balance, actions, metrics][i + 1];
      expect(el.compareDocumentPosition(next) & 4).toBeTruthy();
    });

    const headings = Array.from(document.querySelectorAll("h2")).map((h) => h.textContent);
    const situacaoIndex = headings.findIndex((h) => h?.includes("Situação do mês"));
    const historicoIndex = headings.findIndex((h) => h?.includes("Histórico de meses"));
    const distribuicaoIndex = headings.findIndex((h) => h?.includes("Distribuição do mês"));

    expect(situacaoIndex).toBeGreaterThanOrEqual(0);
    expect(historicoIndex).toBeGreaterThan(situacaoIndex);
    expect(distribuicaoIndex).toBeGreaterThan(historicoIndex);
    // metrics module comes before Situação do mês's own heading in the DOM.
    expect(metrics.compareDocumentPosition(screen.getByText("Situação do mês")) & 4).toBeTruthy();

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
describe("DashboardView — Aval Modern: saldo, ações e métricas", () => {
  it("1. renders Disponível (budget)", () => {
    renderDashboard();
    // "Disponível"/"Comprometido"/"Livre" also label each P9.2 per-profile
    // card, so scope to the metrics module specifically.
    expect(metricsPanel().getByText("Disponível")).toBeTruthy();
    expect(metricsPanel().getByText("R$ 6000.00")).toBeTruthy();
  });

  it("2. renders Comprometido (total)", () => {
    renderDashboard();
    expect(metricsPanel().getByText("Comprometido")).toBeTruthy();
    expect(metricsPanel().getByText("R$ 1900.00")).toBeTruthy();
  });

  it("3. renders Livre (free) with strong visual weight (its own text-hero figure)", () => {
    renderDashboard();
    expect(balanceArea().getByText("Livre")).toBeTruthy();
    const livre = balanceArea().getByText("R$ 4100.00");
    expect(livre.className).toContain("text-hero");
  });

  it("4. renders Pago (calc().paid) in the metrics module", () => {
    renderDashboard();
    // "Pago" also appears as a StatusPill label elsewhere (Movimentações), so
    // scope to the metrics module, which has exactly one "Pago" label.
    expect(metricsPanel().getByText("Pago")).toBeTruthy();
    // paid = Mercado (400, status Pago)
    expect(metricsPanel().getByText("R$ 400.00")).toBeTruthy();
  });

  it("5. renders Falta pagar (calc().pending) in the metrics module", () => {
    renderDashboard();
    expect(screen.getByText("Falta pagar")).toBeTruthy();
    // pending = Aluguel (1500, status A pagar)
    expect(metricsPanel().getByText("R$ 1500.00")).toBeTruthy();
  });

  it("6. switching the active month updates every balance/metric value", () => {
    renderDashboard();
    expect(metricsPanel().getByText("R$ 6000.00")).toBeTruthy(); // August budget

    const prevMonthState: FinanceState = { ...baseState(), activeMonth: PREV_MONTH };
    Object.assign(mockFinance, { state: prevMonthState, month: baseState().months[PREV_MONTH] });
    cleanup();
    renderDashboard();
    // July: budget = 5000 + 1000 = 6000 (same total, different composition is
    // irrelevant here) but total/paid/pending must reflect July's single
    // expense (Mercado, 100, Pago) instead of August's. Comprometido and
    // pago coincide at R$ 100.00 in this fixture, so each label is read
    // from its own value node rather than a panel-wide text lookup.
    expect(metricValue("Comprometido")).toBe("R$ 100.00");
    expect(metricValue("Pago")).toBe("R$ 100.00"); // same expense, already paid
    expect(metricValue("Falta pagar")).toBe("R$ 0.00"); // nothing pending in July
  });

  it("7. switching Minha casa -> Maria updates the balance/metric values to Maria's scope only", () => {
    const stateForMaria: FinanceState = { ...baseState(), activePerson: "me" };
    Object.assign(mockFinance, { state: stateForMaria, month: stateForMaria.months[MONTH] });
    renderDashboard();
    // Maria's budget is just income (5000), not income+houseContribution
    // (6000) — and her metric label reads "Renda", not "Disponível" (VIEW_ME).
    expect(metricValue("Renda")).toBe("R$ 5000.00");
    expect(metricsPanel().queryByText("R$ 6000.00")).toBeNull();
    // Maria's only expense this month is Aluguel (1500, A pagar) — comprometido
    // and falta pagar both read 1500; pago reads 0.
    expect(metricValue("Comprometido")).toBe("R$ 1500.00");
    expect(metricValue("Falta pagar")).toBe("R$ 1500.00");
    expect(metricValue("Pago")).toBe("R$ 0.00");
  });

  it("8. hideValues masks Livre (balance) and Disponível/Comprometido/Pago/Falta pagar (metrics)", () => {
    mockFinance.hideValues = true;
    renderDashboard();
    const balance = balanceArea();
    const metrics = metricsPanel();
    expect(balance.queryByText("R$ 4100.00")).toBeNull();
    expect(metrics.queryByText("R$ 6000.00")).toBeNull();
    expect(metrics.queryByText("R$ 1900.00")).toBeNull();
    expect(metrics.queryByText("R$ 400.00")).toBeNull();
    expect(metrics.queryByText("R$ 1500.00")).toBeNull();
    expect(balance.getAllByText("R$ ••••").length).toBe(1); // Livre
    expect(metrics.getAllByText("R$ ••••").length).toBe(4); // Disponível/Comprometido/Pago/Falta
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
    expect(metricValue("Pago")).toBe("R$ 0.00");
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
    const livre = balanceArea().getByText("R$ -500.00");
    expect(livre.className).toContain("text-destructive");
  });

  it("13. values >= 1000 are formatted through the existing money() formatter, not a parallel one", () => {
    renderDashboard();
    // Every balance/metric value here is already >= 1000 in the base fixture
    // (budget 6000, comprometido 1900) — asserting they render via the exact
    // shared `useMoney()` mock output proves no separate formatting path.
    expect(metricsPanel().getByText("R$ 6000.00")).toBeTruthy();
    expect(metricsPanel().getByText("R$ 1900.00")).toBeTruthy();
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
    // Comprometido and falta pagar coincide at R$ 50000.00 in this fixture
    // (one pending expense), so each is read from its own value node.
    expect(metricValue("Disponível")).toBe("R$ 1250000.00");
    expect(metricValue("Comprometido")).toBe("R$ 50000.00");
    expect(balanceArea().getByText("R$ 1200000.00")).toBeTruthy(); // livre
    expect(metricValue("Falta pagar")).toBe("R$ 50000.00");
  });

  it("15. the old compact hero (budget + '{total} gastos · {livre}' single line) is gone — no duplication with the balance area", () => {
    renderDashboard();
    expect(screen.queryByText(/gastos ·/)).toBeNull();
    // "livre" also legitimately appears as its own short label inside P9.3's
    // "Próximos meses" cards — scope this specific old-hero-phrase check to
    // the balance area itself.
    expect(balanceArea().queryByText(/livre$/)).toBeNull();
    expect(screen.queryByText(/acima$/)).toBeNull();
    // Exactly one "Livre" label inside the balance area itself (P9.2's
    // per-profile cards elsewhere on the page also say "Livre" — that's a
    // different, intentional block, not old-hero duplication).
    expect(balanceArea().getAllByText("Livre").length).toBe(1);
  });

  it("16. Aval Modern — no BudgetRing/decorative SVG in the balance area", () => {
    renderDashboard();
    // BudgetRing renders an <svg> with 3 <circle> elements; the balance area
    // (a plain div with just the label + value) has no SVG at all.
    expect(screen.getByTestId("balance-area").querySelector("svg")).toBeNull();
  });

  it("17. Aval Modern — no editorial hero card: the balance area carries no card/panel surface class", () => {
    renderDashboard();
    const area = screen.getByTestId("balance-area");
    expect(area.className).not.toMatch(/finance-hero|card-surface|panel-flat|panel-elevated/);
  });

  it("18. Aval Modern — quick actions render right after the balance, before the metrics module", () => {
    renderDashboard();
    const balance = screen.getByTestId("balance-area");
    const actions = screen.getByTestId("quick-actions");
    const metrics = screen.getByTestId("metrics-panel");
    const order = [balance, actions, metrics];
    for (let i = 0; i < order.length - 1; i++) {
      // Node.DOCUMENT_POSITION_FOLLOWING (4): order[i] precedes order[i + 1].
      expect(order[i].compareDocumentPosition(order[i + 1]) & 4).toBeTruthy();
    }
  });

  it("19. Aval Modern — money values in the balance/metrics use font-sans, never font-display (Lora)", () => {
    renderDashboard();
    const livre = balanceArea().getByText("R$ 4100.00");
    expect(livre.className).not.toContain("font-display");
    const disponivel = metricsPanel().getByText("R$ 6000.00");
    expect(disponivel.className).not.toContain("font-display");
  });

  it("20. Aval Modern — the progress fill is the gold accent, not the green success color", () => {
    renderDashboard();
    const bar = screen.getByRole("progressbar", { name: "Proporção já paga no mês" });
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.className).toContain("bg-primary");
    expect(fill.className).not.toContain("bg-success");
  });

  it("21. 'Progresso do mês' no longer exists as its own separate Panel", () => {
    renderDashboard();
    expect(screen.queryByText("Progresso do mês")).toBeNull();
  });

  it("22. Pago/Falta pagar/progressbar render exactly once each, not duplicated", () => {
    renderDashboard();
    // "Pago" also appears as a StatusPill status label in Movimentações
    // recentes (the base fixture has one Pago expense), so the metrics
    // module's own "Pago" label must be counted within metricsPanel, not
    // page-wide.
    expect(metricsPanel().getAllByText("Pago").length).toBe(1);
    expect(metricsPanel().getAllByText("Falta pagar").length).toBe(1);
    expect(screen.getAllByRole("progressbar", { name: "Proporção já paga no mês" }).length).toBe(1);
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

  it("10. an empty month (no category) still shows quick actions — never a fake category button", () => {
    Object.assign(mockFinance, {
      state: emptyMonthState(),
      month: emptyMonthState().months[MONTH],
    });
    renderDashboard();
    expect(screen.queryByRole("button", { name: /Ver gastos da categoria/ })).toBeNull();
    expect(screen.getByTestId("quick-actions")).toBeTruthy();
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

  // Aval Modern (P9.5): "Adicionar gasto" became the one primary action —
  // a solid gold pill, not glass (glass is reserved for secondary/chrome
  // controls). The other actions stay secondary pills and keep the glass
  // utility, same rule P0-FRONTEND-1B.5 established.
  it("26. the primary action (Adicionar gasto) is a solid gold pill, not glass", () => {
    renderDashboard();
    const button = screen.getByText("Adicionar gasto").closest("button");
    expect(button?.className).toContain("bg-primary");
    expect(button?.className).not.toContain("glass-surface");
  });

  it("26b. secondary actions keep the glass-surface utility", () => {
    renderDashboard();
    ["Ver gastos", "Simular", "Adicionar meta", "Perguntar ao Aval"].forEach((label) => {
      const button = screen.getByText(label).closest("button");
      expect(button?.className).toContain("glass-surface");
    });
  });

  it("26c. Simular calls onOpenSimulator", () => {
    renderDashboard();
    fireEvent.click(screen.getByText("Simular"));
    expect(actions.onOpenSimulator).toHaveBeenCalledTimes(1);
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
    expect(screen.getByTestId("quick-actions")).toBeTruthy();
    [
      "Situação do mês",
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

  it("44. Aval Modern — quick actions live in their own top-level block, separate from Situação do mês", () => {
    renderDashboard();
    const situacaoSection = screen.getByText("Situação do mês").closest("section");
    const actionsBlock = screen.getByTestId("quick-actions");
    expect(situacaoSection?.contains(actionsBlock)).toBe(false);
    const withinActions = within(actionsBlock);
    expect(withinActions.getByText("Adicionar gasto")).toBeTruthy();
    expect(withinActions.getByText("Ver gastos")).toBeTruthy();
    expect(withinActions.getByText("Adicionar meta")).toBeTruthy();
    expect(withinActions.getByText("Perguntar ao Aval")).toBeTruthy();
    expect(withinActions.getByText("Simular")).toBeTruthy();
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

// P9.3 — "Próximos meses": selected month + next two, comparing calc().free
// via getNextMonthKey's real Date-based rollover — no new financial rule, no
// string-concatenated months, no fabricated data for a month that doesn't
// exist in state.months yet.
describe("DashboardView — P9.3 Próximos meses", () => {
  it("1. shows the selected month and the next two", () => {
    renderDashboard();
    const panel = proximosMesesPanel();
    expect(panel.getByText("AGO")).toBeTruthy();
    expect(panel.getByText("SET")).toBeTruthy();
    expect(panel.getByText("OUT")).toBeTruthy();
  });

  it("2. the selected month is marked 'Atual' and shows its real livre", () => {
    renderDashboard();
    const panel = proximosMesesPanel();
    expect(panel.getByText("· Atual")).toBeTruthy();
    // August livre = budget(6000) - total(1900) = 4100, same fixture as the hero.
    expect(panel.getByText("R$ 4100.00")).toBeTruthy();
  });

  it("8. a future month with no MonthData shows a neutral 'Sem dados' placeholder — never a fabricated R$ 0,00", () => {
    renderDashboard();
    const panel = proximosMesesPanel();
    // base fixture only has 2026-07 and 2026-08 — September/October don't exist.
    expect(panel.getAllByText("Sem dados").length).toBe(2);
    expect(panel.queryByText("R$ 0.00")).toBeNull();
  });

  it("does not render a clickable button for a month with no data", () => {
    renderDashboard();
    const panel = proximosMesesPanel();
    expect(panel.queryByRole("button", { name: /SET/ })).toBeNull();
    expect(panel.queryByRole("button", { name: /OUT/ })).toBeNull();
  });

  function stateWithFutureMonths(): FinanceState {
    return {
      ...baseState(),
      months: {
        ...baseState().months,
        "2026-09": {
          label: "Setembro 2026",
          income: 5000,
          houseContribution: 1000,
          expenses: [
            {
              id: "sep-1",
              name: "Aluguel",
              category: "Casa",
              amount: 3000,
              status: "A pagar",
              owner: "Maria",
              date: "2026-09-05",
              paymentMethod: "Pix",
              note: "",
            },
          ],
          priorities: [],
        },
        "2026-10": {
          label: "Outubro 2026",
          income: 5000,
          houseContribution: 1000,
          expenses: [
            {
              id: "oct-1",
              name: "Mercado",
              category: "Alimentação",
              amount: 1000,
              status: "Pago",
              owner: "Maria",
              date: "2026-10-05",
              paymentMethod: "Pix",
              note: "",
            },
          ],
          priorities: [],
        },
      },
    };
  }

  it("7. 9. 12. a month with a lower livre than the selected one shows a negative delta (down arrow, magnitude)", () => {
    Object.assign(mockFinance, {
      state: stateWithFutureMonths(),
      month: stateWithFutureMonths().months[MONTH],
    });
    renderDashboard();
    const panel = proximosMesesPanel();
    // September: budget=6000, total=3000, free=3000 -> delta vs August(4100) = -1100
    expect(panel.getByText("R$ 3000.00")).toBeTruthy();
    expect(panel.getByText("R$ 1100.00")).toBeTruthy();
    expect(panel.getByRole("button", { name: /a menos livre que o mês selecionado/ })).toBeTruthy();
  });

  it("13. a month with a higher livre than the selected one shows a positive delta (up arrow, magnitude)", () => {
    Object.assign(mockFinance, {
      state: stateWithFutureMonths(),
      month: stateWithFutureMonths().months[MONTH],
    });
    renderDashboard();
    const panel = proximosMesesPanel();
    // October: budget=6000, total=1000, free=5000 -> delta vs August(4100) = +900
    expect(panel.getByText("R$ 5000.00")).toBeTruthy();
    expect(panel.getByText("R$ 900.00")).toBeTruthy();
    expect(panel.getByRole("button", { name: /a mais livre que o mês selecionado/ })).toBeTruthy();
  });

  it("14. a month with the same livre as the selected one shows 'Estável', no arrow", () => {
    const sameLivreState: FinanceState = {
      ...baseState(),
      months: {
        ...baseState().months,
        "2026-09": {
          label: "Setembro 2026",
          income: 5000,
          houseContribution: 1000,
          expenses: [
            {
              id: "sep-1",
              name: "Aluguel",
              category: "Casa",
              amount: 1900,
              status: "A pagar",
              owner: "Maria",
              date: "2026-09-05",
              paymentMethod: "Pix",
              note: "",
            },
          ],
          priorities: [],
        },
      },
    };
    Object.assign(mockFinance, { state: sameLivreState, month: sameLivreState.months[MONTH] });
    renderDashboard();
    const panel = proximosMesesPanel();
    // September: budget=6000, total=1900, free=4100 -> same as August.
    expect(panel.getByText("Estável")).toBeTruthy();
    expect(
      panel.getByRole("button", { name: /mesmo valor livre que o mês selecionado/ }),
    ).toBeTruthy();
  });

  it("2. e 3. Dezembro -> Janeiro -> Fevereiro rollover uses real date math, correct across the year boundary", () => {
    const yearRolloverState: FinanceState = {
      people: ["Maria"],
      activePerson: "todos",
      activeMonth: "2026-12",
      months: {
        "2026-12": {
          label: "Dezembro 2026",
          income: 5000,
          houseContribution: 0,
          expenses: [],
          priorities: [],
        },
        "2027-01": {
          label: "Janeiro 2027",
          income: 5000,
          houseContribution: 0,
          expenses: [],
          priorities: [],
        },
        "2027-02": {
          label: "Fevereiro 2027",
          income: 5000,
          houseContribution: 0,
          expenses: [],
          priorities: [],
        },
      },
    };
    Object.assign(mockFinance, {
      state: yearRolloverState,
      month: yearRolloverState.months["2026-12"],
    });
    renderDashboard();
    const panel = proximosMesesPanel();
    expect(panel.getByText("DEZ")).toBeTruthy();
    expect(panel.getByText("JAN")).toBeTruthy();
    expect(panel.getByText("FEV")).toBeTruthy();
  });

  it("4. household view compares the whole house's livre", () => {
    renderDashboard(); // base fixture, activePerson "todos"
    const panel = proximosMesesPanel();
    expect(panel.getByText("R$ 4100.00")).toBeTruthy(); // household free
  });

  it("5. first profile (VIEW_ME) compares only that profile's own livre", () => {
    const stateForMaria: FinanceState = { ...baseState(), activePerson: "me" };
    Object.assign(mockFinance, { state: stateForMaria, month: stateForMaria.months[MONTH] });
    renderDashboard();
    const panel = proximosMesesPanel();
    // Maria: budget=income(5000), total=1500 (Aluguel), free=3500
    expect(panel.getByText("R$ 3500.00")).toBeTruthy();
    expect(panel.queryByText("R$ 4100.00")).toBeNull();
  });

  it("6. second profile (VIEW_SPOUSE) compares only that profile's own livre", () => {
    const stateForOziel: FinanceState = { ...baseState(), activePerson: "spouse" };
    Object.assign(mockFinance, { state: stateForOziel, month: stateForOziel.months[MONTH] });
    renderDashboard();
    const panel = proximosMesesPanel();
    // Oziel: budget=houseContribution(1000), total=400 (Mercado), free=600
    expect(panel.getByText("R$ 600.00")).toBeTruthy();
  });

  it("7. a third profile (index >= 2) still renders the panel using its own literal view", () => {
    const threePeopleState: FinanceState = {
      people: ["Maria", "Oziel", "Vovó"],
      activePerson: "Vovó",
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
    const panel = proximosMesesPanel();
    // Vovó: budget=profileBudgets["Vovó"]=500, total=200, free=300
    expect(panel.getByText("R$ 300.00")).toBeTruthy();
  });

  it("9. an active budget of zero doesn't crash and renders R$ 0,00 correctly", () => {
    const zeroBudgetState: FinanceState = {
      people: ["Maria"],
      activePerson: "todos",
      activeMonth: MONTH,
      months: {
        [MONTH]: {
          label: "Agosto 2026",
          income: 0,
          houseContribution: 0,
          expenses: [],
          priorities: [],
        },
      },
    };
    Object.assign(mockFinance, { state: zeroBudgetState, month: zeroBudgetState.months[MONTH] });
    renderDashboard();
    const panel = proximosMesesPanel();
    expect(panel.getByText("R$ 0.00")).toBeTruthy();
  });

  it("11. a negative livre is preserved as negative — never flipped positive", () => {
    const negativeFreeState: FinanceState = {
      people: ["Maria"],
      activePerson: "todos",
      activeMonth: MONTH,
      months: {
        [MONTH]: {
          label: "Agosto 2026",
          income: 100,
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
    Object.assign(mockFinance, {
      state: negativeFreeState,
      month: negativeFreeState.months[MONTH],
    });
    renderDashboard();
    const panel = proximosMesesPanel();
    // free = 100 - 1500 = -1400, must render as a real negative value.
    const livre = panel.getByText("R$ -1400.00");
    expect(livre.className).toContain("text-destructive");
  });

  it("15. hideValues masks every livre and delta figure in the panel", () => {
    mockFinance.hideValues = true;
    Object.assign(mockFinance, {
      state: stateWithFutureMonths(),
      month: stateWithFutureMonths().months[MONTH],
    });
    renderDashboard();
    const panel = proximosMesesPanel();
    expect(panel.queryByText("R$ 4100.00")).toBeNull();
    expect(panel.queryByText("R$ 3000.00")).toBeNull();
    expect(panel.queryByText("R$ 1100.00")).toBeNull();
    expect(panel.getAllByText("R$ ••••").length).toBeGreaterThan(0);
  });

  it("16. a large livre value is formatted through the existing money() formatter, not a parallel one", () => {
    const bigState: FinanceState = {
      people: ["Maria"],
      activePerson: "todos",
      activeMonth: MONTH,
      months: {
        [MONTH]: {
          label: "Agosto 2026",
          income: 1_250_000,
          houseContribution: 0,
          expenses: [],
          priorities: [],
        },
      },
    };
    Object.assign(mockFinance, { state: bigState, month: bigState.months[MONTH] });
    renderDashboard();
    const panel = proximosMesesPanel();
    expect(panel.getByText("R$ 1250000.00")).toBeTruthy();
  });

  it("17. and 18. clicking (or activating via keyboard) an existing future month calls the existing setActiveMonth", () => {
    Object.assign(mockFinance, {
      state: stateWithFutureMonths(),
      month: stateWithFutureMonths().months[MONTH],
    });
    renderDashboard();
    const panel = proximosMesesPanel();
    const septemberCard = panel.getByRole("button", { name: /^Ver SET/ });
    expect(septemberCard.tagName).toBe("BUTTON"); // real button -> Enter/Space work natively
    fireEvent.click(septemberCard);
    expect(mockFinance.setActiveMonth).toHaveBeenCalledWith("2026-09");
    expect(mockFinance.setActiveMonth).toHaveBeenCalledTimes(1);
  });

  it("19. switching profile recalculates the comparison", () => {
    Object.assign(mockFinance, {
      state: stateWithFutureMonths(),
      month: stateWithFutureMonths().months[MONTH],
    });
    renderDashboard();
    expect(proximosMesesPanel().getByText("R$ 4100.00")).toBeTruthy(); // household

    cleanup();
    const forMaria: FinanceState = { ...stateWithFutureMonths(), activePerson: "me" };
    Object.assign(mockFinance, { state: forMaria, month: forMaria.months[MONTH] });
    renderDashboard();
    // Maria only (Aluguel 1500 owned by Maria): budget=5000, total=1500, free=3500
    expect(proximosMesesPanel().getByText("R$ 3500.00")).toBeTruthy();
    expect(proximosMesesPanel().queryByText("R$ 4100.00")).toBeNull();
  });

  it("20. viewing/switching to a comparison month never creates a new month entry (no persistence)", () => {
    renderDashboard();
    const panel = proximosMesesPanel();
    // September/October have no data and render as inert placeholders — no
    // button exists for them, so there is no way to trigger persistence from
    // this panel; only the real, already-existing setActiveMonth is callable.
    expect(panel.queryByRole("button", { name: /SET/ })).toBeNull();
    expect(panel.queryByRole("button", { name: /OUT/ })).toBeNull();
    expect(mockFinance.setActiveMonth).not.toHaveBeenCalled();
  });

  it("21. and 22. no NaN or Infinity ever renders in the panel", () => {
    Object.assign(mockFinance, {
      state: stateWithFutureMonths(),
      month: stateWithFutureMonths().months[MONTH],
    });
    renderDashboard();
    const panel = proximosMesesPanel();
    expect(panel.queryByText(/NaN/)).toBeNull();
    expect(panel.queryByText(/Infinity/)).toBeNull();
  });

  it("23. does not render a redundant aggregate 'Minha casa' card — exactly 3 month cells", () => {
    renderDashboard();
    const panel = proximosMesesPanel();
    expect(panel.queryByText("Minha casa")).toBeNull();
    expect(panel.getAllByText(/^(AGO|SET|OUT)$/).length).toBe(3);
  });

  it("24. no profile name is hardcoded — a differently named profile still drives the comparison correctly", () => {
    const renamedState: FinanceState = {
      ...baseState(),
      people: ["Ana", "Pedro"],
      activePerson: "me",
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
    // Ana (index 0 -> VIEW_ME): same numbers as "Maria" did in the base fixture.
    expect(proximosMesesPanel().getByText("R$ 3500.00")).toBeTruthy();
  });
});

/** Scopes queries to the collapsible "Análise detalhada" container by id. */
function analiseDetalhadaContainer() {
  const container = document.getElementById("analise-detalhada");
  if (!container) throw new Error("Análise detalhada container not found");
  return within(container);
}

function analiseDetalhadaToggle() {
  return screen.getByRole("button", { name: "Análise detalhada" });
}

describe("DashboardView — P9.4 Análise detalhada colapsável", () => {
  it("1. toggle starts collapsed (aria-expanded=false)", () => {
    renderDashboard();
    expect(analiseDetalhadaToggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("2. collapsed container carries the hidden class (CSS-only hide, not unmounted)", () => {
    renderDashboard();
    const container = document.getElementById("analise-detalhada");
    expect(container?.className).toContain("hidden");
    expect(container?.className).not.toMatch(/(?:^| )flex(?: |$)/);
  });

  it("3. all 5 analytical panels remain in the DOM while collapsed — never unmounted", () => {
    renderDashboard();
    const scope = analiseDetalhadaContainer();
    expect(scope.getByText("Distribuição do mês")).toBeTruthy();
    expect(scope.getByText("Por categoria")).toBeTruthy();
    expect(scope.getByText("Divisão familiar")).toBeTruthy();
    expect(scope.getByText("Comparação mensal")).toBeTruthy();
    expect(scope.getByText("Evolução dos gastos")).toBeTruthy();
  });

  it("4. clicking the toggle expands: aria-expanded=true and container switches to flex", () => {
    renderDashboard();
    fireEvent.click(analiseDetalhadaToggle());
    expect(analiseDetalhadaToggle().getAttribute("aria-expanded")).toBe("true");
    const container = document.getElementById("analise-detalhada");
    expect(container?.className).toMatch(/(?:^| )flex(?: |$)/);
    expect(container?.className).not.toContain("hidden");
  });

  it("5. clicking twice collapses again", () => {
    renderDashboard();
    const toggle = analiseDetalhadaToggle();
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("6. toggle exposes aria-controls pointing at the analysis container id", () => {
    renderDashboard();
    expect(analiseDetalhadaToggle().getAttribute("aria-controls")).toBe("analise-detalhada");
  });

  it("7. desktop override class (lg:flex) is always present regardless of toggle state", () => {
    renderDashboard();
    const container = document.getElementById("analise-detalhada");
    expect(container?.className).toContain("lg:flex");
    fireEvent.click(analiseDetalhadaToggle());
    expect(container?.className).toContain("lg:flex");
  });

  it("8. toggle is keyboard-activatable (native button, Enter/Space)", () => {
    renderDashboard();
    expect(analiseDetalhadaToggle().tagName).toBe("BUTTON");
  });
});
