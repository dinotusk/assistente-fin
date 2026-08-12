// @vitest-environment jsdom
// P0-FRONTEND-1B.4 — cross-component navigation added to the Painel: the top
// category chip and the "Ver gastos"/"Adicionar meta"/"Perguntar ao Aval"
// quick actions all reuse existing flows (TransactionsView's own search
// filter, the existing dialogs, the existing views) instead of new parallel
// mechanisms. DashboardView and TransactionsView are rendered for real here
// (not mocked) so the actual hand-off between them is what's under test —
// DashboardView.test.tsx and TransactionsView.test.tsx already cover each
// component in isolation.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActiveUser, FinanceState } from "@/lib/finance/types";

// jsdom doesn't implement matchMedia; AppHome's useIsDesktop() hook needs it
// to pick the mobile vs desktop layout — the FAB only exists in the desktop
// branch, so the FAB describe block below flips this to true.
let desktopMode = false;
window.matchMedia = ((query: string) => ({
  matches: desktopMode,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

vi.mock("./AccountDialogs", () => ({
  AccountDialog: () => null,
  ChangePasswordDialog: () => null,
  MembersDialog: () => null,
  PersonalDataDialog: () => null,
  SecurityDialog: () => null,
}));
vi.mock("./AiConsentDialog", () => ({ AiConsentDialog: () => null }));
vi.mock("./AssistantView", () => ({ AssistantView: () => <div>AssistantViewRendered</div> }));
vi.mock("./ConflictDialog", () => ({ ConflictDialog: () => null }));
vi.mock("./BottomNav", () => ({ BottomNav: () => null }));
vi.mock("./SideNav", () => ({ SideNav: () => null }));
vi.mock("./PrioritiesView", () => ({ PrioritiesView: () => null }));
vi.mock("./SettingsView", () => ({ SettingsView: () => null }));
vi.mock("./dialogs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./dialogs")>();
  return {
    ...actual,
    BankImportDialog: () => null,
    CategoriesDialog: () => null,
    EnvelopesDialog: () => null,
    ExpenseDialog: ({ open }: { open: boolean }) => (open ? <div>ExpenseDialogOpen</div> : null),
    InviteDialog: () => null,
    JoinHouseholdDialog: () => null,
    MonthDialog: () => null,
    PeopleDialog: () => null,
    PriorityDialog: ({ open }: { open: boolean }) => (open ? <div>PriorityDialogOpen</div> : null),
    PurchaseSimulatorDialog: () => null,
    PushNotificationsDialog: () => null,
    VigiasDialog: () => null,
  };
});

const MONTH = "2026-08";

function baseState(): FinanceState {
  return {
    people: ["Maria", "Oziel"],
    activePerson: "todos",
    activeMonth: MONTH,
    months: {
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

const mockFinance = {
  activeUser: { id: "user-1", name: "Oziel", email: "oziel@example.com" } as ActiveUser,
  state: baseState(),
  month: baseState().months[MONTH],
  hideValues: false,
  toggleHideValues: vi.fn(),
  setActivePerson: vi.fn(),
  setActiveMonth: vi.fn(),
  createNextMonth: vi.fn(),
  logout: vi.fn(),
  writeConflict: null,
  refreshAfterConflict: vi.fn(),
  dismissWriteConflict: vi.fn(),
  toggleExpenseStatus: vi.fn(),
  deleteExpense: vi.fn(),
  duplicateExpense: vi.fn(),
};

vi.mock("@/lib/finance/FinanceContext", () => ({
  useFinance: () => mockFinance,
  useMoney: () => (value: number) =>
    mockFinance.hideValues ? "R$ ••••" : `R$ ${value.toFixed(2)}`,
  useMoneyShort: () => (value: number) =>
    mockFinance.hideValues ? "R$ ••••" : `R$ ${value.toFixed(0)}`,
}));

const { AppHome } = await import("./AppHome");

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mockFinance, { state: baseState(), month: baseState().months[MONTH] });
  mockFinance.hideValues = false;
  desktopMode = false;
});
afterEach(() => cleanup());

describe("AppHome — categoria principal navega para Gastos filtrado (P0-FRONTEND-1B.4)", () => {
  it("1. clicking the top category chip switches to Gastos", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByRole("button", { name: /Ver gastos da categoria Casa/ }));
    expect(screen.getByRole("heading", { name: "Gastos" })).toBeTruthy();
  });

  it("2. the correct category filter is applied — matching expense shows, non-matching is hidden", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByRole("button", { name: /Ver gastos da categoria Casa/ }));
    expect(screen.getByText("Aluguel")).toBeTruthy();
    expect(screen.queryByText("Mercado")).toBeNull();
  });

  it("3. mês atual preservado — no setActiveMonth call happens on this navigation", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByRole("button", { name: /Ver gastos da categoria Casa/ }));
    expect(mockFinance.setActiveMonth).not.toHaveBeenCalled();
  });

  it("4. view atual preservada — no setActivePerson call happens on this navigation", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByRole("button", { name: /Ver gastos da categoria Casa/ }));
    expect(mockFinance.setActivePerson).not.toHaveBeenCalled();
  });
});

describe("AppHome — Ações rápidas (P0-FRONTEND-1B.4)", () => {
  it("5. Ver gastos navigates to Gastos with no filter applied", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByText("Ver gastos"));
    expect(screen.getByRole("heading", { name: "Gastos" })).toBeTruthy();
    // no category filter -> both expenses are visible.
    expect(screen.getByText("Aluguel")).toBeTruthy();
    expect(screen.getByText("Mercado")).toBeTruthy();
  });

  it("6. Adicionar meta opens the existing priority dialog", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByText("Adicionar meta"));
    expect(screen.getByText("PriorityDialogOpen")).toBeTruthy();
  });

  it("7. Adicionar gasto opens the existing expense dialog", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByText("Adicionar gasto"));
    expect(screen.getByText("ExpenseDialogOpen")).toBeTruthy();
  });

  it("8. Perguntar ao Aval navigates to the Aval view", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByText("Perguntar ao Aval"));
    expect(screen.getByText("AssistantViewRendered")).toBeTruthy();
  });
});

// The FAB only exists in the desktop header (there's no mobile FAB at all —
// mobile relies on the bottom nav's Aval button and, now, Ações rápidas).
describe("AppHome — FAB no desktop (P0-FRONTEND-1B.4)", () => {
  beforeEach(() => {
    desktopMode = true;
  });

  it("9. no FAB on the Painel — Ações rápidas already covers Adicionar gasto there", () => {
    render(<AppHome />);
    expect(screen.queryByText("Novo gasto")).toBeNull();
  });

  it("10. FAB still present on Gastos", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByText("Ver gastos"));
    expect(screen.getByText("Novo gasto")).toBeTruthy();
  });

  it("12. the FAB stays solid — never a glass- utility (P0-FRONTEND-1B.6)", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByText("Ver gastos"));
    const fab = screen.getByText("Novo gasto").closest("button");
    expect(fab?.className).toContain("bg-primary");
    expect(fab?.className).not.toMatch(/glass-/);
  });

  it("11. FAB still present on Aval", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByText("Perguntar ao Aval"));
    expect(screen.getByText("Novo gasto")).toBeTruthy();
  });
});

describe("AppHome — hideValues continua funcionando (P0-FRONTEND-1B.4 regressão)", () => {
  it("12. hideValues masks the Painel numbers", () => {
    mockFinance.hideValues = true;
    render(<AppHome />);
    expect(screen.getAllByText("R$ ••••").length).toBeGreaterThan(0);
  });
});
