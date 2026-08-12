// @vitest-environment jsdom
// P0-FRONTEND-1B.1 Etapa 3 — excluir gasto must never fire on a single tap,
// must show a confirmation naming the real action, must stay open with a
// loading state while deleteExpense's promise is in flight, and must never
// remove the row or claim success if that promise rejects.
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FinanceState } from "@/lib/finance/types";

// ConfirmDialog (used by TransactionsView) renders SheetShell, which wraps
// vaul's Drawer — swapped for a plain conditional render, same approach as
// ConflictDialog.test.tsx / AccountDialogs.test.tsx.
vi.mock("./dialogs", () => ({
  SheetShell: ({ open, title, children }: { open: boolean; title: string; children: ReactNode }) =>
    open ? (
      <div>
        <h1>{title}</h1>
        {children}
      </div>
    ) : null,
}));

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
            name: "Padaria",
            category: "Alimentação",
            amount: 42,
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
}

const mockFinance = {
  month: baseState().months[MONTH],
  state: baseState(),
  toggleExpenseStatus: vi.fn(),
  deleteExpense: vi.fn().mockResolvedValue(undefined),
  duplicateExpense: vi.fn(),
};

vi.mock("@/lib/finance/FinanceContext", () => ({
  useFinance: () => mockFinance,
  useMoney: () => (value: number) => `R$ ${value.toFixed(2)}`,
}));

const { TransactionsView } = await import("./TransactionsView");

beforeEach(() => {
  vi.clearAllMocks();
  mockFinance.month = baseState().months[MONTH];
  mockFinance.state = baseState();
  mockFinance.deleteExpense.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe("TransactionsView — excluir gasto", () => {
  it("1. a single tap on Excluir does not delete the expense", () => {
    render(<TransactionsView onEdit={vi.fn()} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Excluir"));
    expect(mockFinance.deleteExpense).not.toHaveBeenCalled();
    expect(screen.getByText("Padaria")).toBeTruthy();
  });

  it("2. Cancelar preserves the expense untouched", () => {
    render(<TransactionsView onEdit={vi.fn()} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Excluir"));
    fireEvent.click(screen.getByText("Cancelar"));
    expect(mockFinance.deleteExpense).not.toHaveBeenCalled();
    expect(screen.getByText("Padaria")).toBeTruthy();
  });

  it("3. Confirmar calls deleteExpense with the right id", async () => {
    render(<TransactionsView onEdit={vi.fn()} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Excluir"));
    fireEvent.click(screen.getByText("Excluir gasto"));
    await waitFor(() => expect(mockFinance.deleteExpense).toHaveBeenCalledWith("exp-1"));
  });

  it("4. shows a loading/disabled state while the delete is in flight", async () => {
    let resolveDelete: () => void = () => {};
    mockFinance.deleteExpense.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    render(<TransactionsView onEdit={vi.fn()} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Excluir"));
    fireEvent.click(screen.getByText("Excluir gasto"));

    expect(await screen.findByText("Excluindo...")).toBeTruthy();
    expect((screen.getByText("Excluindo...") as HTMLButtonElement).disabled).toBe(true);

    resolveDelete();
    await waitFor(() => expect(screen.queryByText("Excluir gasto?")).toBeNull());
  });

  it("5. a failed delete keeps the confirmation open, shows an error, and the row is never removed", async () => {
    mockFinance.deleteExpense.mockRejectedValue(new Error("Não foi possível excluir agora."));
    render(<TransactionsView onEdit={vi.fn()} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Excluir"));
    fireEvent.click(screen.getByText("Excluir gasto"));

    expect(await screen.findByText("Não foi possível excluir agora.")).toBeTruthy();
    expect(screen.getByText("Excluir gasto?")).toBeTruthy();
    expect(screen.getByText("Padaria")).toBeTruthy();
  });
});

// P0-FRONTEND-1B.4 — the Painel's "categoria que mais pesa" chip now opens
// this screen pre-filtered. It reuses the existing free-text search state
// (there was no separate category filter to plug into) instead of adding a
// second, parallel filter mechanism.
describe("TransactionsView — initialCategory (P0-FRONTEND-1B.4)", () => {
  function stateWithTwoCategories(): FinanceState {
    const state = baseState();
    state.months[MONTH].expenses.push({
      id: "exp-2",
      name: "Aluguel",
      category: "Casa",
      amount: 1500,
      status: "A pagar",
      owner: "Maria",
      date: `${MONTH}-10`,
      paymentMethod: "Pix",
      note: "",
    });
    return state;
  }

  it("6. pre-fills the search box with the given category", () => {
    mockFinance.state = stateWithTwoCategories();
    mockFinance.month = mockFinance.state.months[MONTH];
    render(<TransactionsView onEdit={vi.fn()} onAdd={vi.fn()} initialCategory="Casa" />);
    expect((screen.getByLabelText(/Buscar/) as HTMLInputElement).value).toBe("Casa");
  });

  it("7. only shows expenses matching that category", () => {
    mockFinance.state = stateWithTwoCategories();
    mockFinance.month = mockFinance.state.months[MONTH];
    render(<TransactionsView onEdit={vi.fn()} onAdd={vi.fn()} initialCategory="Casa" />);
    expect(screen.getByText("Aluguel")).toBeTruthy();
    expect(screen.queryByText("Padaria")).toBeNull();
  });

  it("8. with no initialCategory, every expense is shown as before", () => {
    mockFinance.state = stateWithTwoCategories();
    mockFinance.month = mockFinance.state.months[MONTH];
    render(<TransactionsView onEdit={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText("Aluguel")).toBeTruthy();
    expect(screen.getByText("Padaria")).toBeTruthy();
  });
});

// P0-FRONTEND-1B.6 — filter pills are chrome/controls (glass); the search
// box and every expense row show real financial data (must stay solid).
describe("TransactionsView — Aval Glass (P0-FRONTEND-1B.6)", () => {
  it("9. inactive filter pills carry the glass-surface utility (active pill stays solid gold, same as Segmented)", () => {
    render(<TransactionsView onEdit={vi.fn()} onAdd={vi.fn()} />);
    // "Tudo" is the default active filter — the row it sits in is the
    // filters bar, distinct from any expense row's own status-toggle button.
    const filterBar = screen.getByText("Tudo").closest("button")?.parentElement;
    const pills = filterBar ? Array.from(filterBar.querySelectorAll("button")) : [];
    const byLabel = (label: string) => pills.find((b) => b.textContent?.trim() === label);
    ["Entradas", "Saídas", "A pagar", "Pagos"].forEach((label) => {
      expect(byLabel(label)?.className).toContain("glass-surface");
    });
    expect(byLabel("Tudo")?.className).not.toMatch(/glass-surface/);
  });

  it("10. filter pills keep a 44px minimum touch target", () => {
    render(<TransactionsView onEdit={vi.fn()} onAdd={vi.fn()} />);
    const filterBar = screen.getByText("Tudo").closest("button")?.parentElement;
    const pill = filterBar ? Array.from(filterBar.querySelectorAll("button"))[0] : null;
    expect(pill?.className).toContain("min-h-11");
  });

  it("11. the search input never carries a glass- utility", () => {
    render(<TransactionsView onEdit={vi.fn()} onAdd={vi.fn()} />);
    const input = screen.getByLabelText(/Buscar/);
    expect(input.className).not.toMatch(/glass-/);
  });

  it("12. an expense row never carries a glass- utility", () => {
    render(<TransactionsView onEdit={vi.fn()} onAdd={vi.fn()} />);
    const row = screen.getByText("Padaria").closest("div.card-surface");
    expect(row).toBeTruthy();
    expect(row?.className).not.toMatch(/glass-/);
  });
});
