// @vitest-environment jsdom
// P0-FRONTEND-1B.1 Etapa 8/9 — async save pattern (idle -> saving -> success
// / error) for ExpenseDialog, PriorityDialog and PeopleDialog: never closes
// before the save promise resolves, shows a busy/disabled state while it's
// in flight, blocks double-submit, and on failure keeps the form open with
// the user's values intact and a visible error instead of a silent failure.
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FinanceState } from "@/lib/finance/types";

vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DrawerContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
}));

const MONTH = "2026-08";

function baseState(): FinanceState {
  return {
    people: ["Maria", "Oziel"],
    activePerson: "eu",
    activeMonth: MONTH,
    months: {
      [MONTH]: {
        label: "Agosto 2026",
        income: 5000,
        houseContribution: 1000,
        expenses: [],
        priorities: [],
      },
    },
  };
}

const mockFinance = {
  month: baseState().months[MONTH],
  state: baseState(),
  saveExpense: vi.fn().mockResolvedValue(undefined),
  savePriority: vi.fn().mockResolvedValue(undefined),
  savePeople: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/lib/finance/FinanceContext", () => ({
  useFinance: () => mockFinance,
}));

vi.mock("@/lib/finance/learnedCategories", () => ({
  learnCategory: vi.fn(),
  forgetCategory: vi.fn(),
  listLearnedCategories: vi.fn(() => []),
  lookupLearnedCategory: vi.fn(() => null),
}));

const { ExpenseDialog, PriorityDialog, PeopleDialog } = await import("./dialogs");

beforeEach(() => {
  vi.clearAllMocks();
  mockFinance.month = baseState().months[MONTH];
  mockFinance.state = baseState();
  mockFinance.saveExpense.mockResolvedValue(undefined);
  mockFinance.savePriority.mockResolvedValue(undefined);
  mockFinance.savePeople.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe("ExpenseDialog — salvar (criar/editar gasto)", () => {
  function fillMinimal() {
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Mercado" } });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "50" } });
  }

  it("does not close before saveExpense resolves; blocks double-submit", async () => {
    let resolveSave: () => void = () => {};
    mockFinance.saveExpense.mockImplementation(
      () => new Promise<void>((resolve) => (resolveSave = resolve)),
    );
    const onOpenChange = vi.fn();
    render(<ExpenseDialog open={true} onOpenChange={onOpenChange} editingId={null} />);
    fillMinimal();

    fireEvent.click(screen.getByText("Salvar"));
    expect(await screen.findByText("Salvando...")).toBeTruthy();
    fireEvent.click(screen.getByText("Salvando..."));
    expect(mockFinance.saveExpense).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();

    resolveSave();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("a failed save keeps the dialog open, keeps the typed name, and shows the error", async () => {
    mockFinance.saveExpense.mockRejectedValue(new Error("Falha ao salvar o gasto."));
    const onOpenChange = vi.fn();
    render(<ExpenseDialog open={true} onOpenChange={onOpenChange} editingId={null} />);
    fillMinimal();

    fireEvent.click(screen.getByText("Salvar"));
    expect(await screen.findByText("Falha ao salvar o gasto.")).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect((screen.getByDisplayValue("Mercado") as HTMLInputElement).value).toBe("Mercado");
  });
});

describe("PriorityDialog — salvar (criar/editar prioridade)", () => {
  it("does not close before savePriority resolves; blocks double-submit", async () => {
    let resolveSave: () => void = () => {};
    mockFinance.savePriority.mockImplementation(
      () => new Promise<void>((resolve) => (resolveSave = resolve)),
    );
    const onOpenChange = vi.fn();
    render(<PriorityDialog open={true} onOpenChange={onOpenChange} editingId={null} />);
    fireEvent.change(screen.getByLabelText("Item"), { target: { value: "Viagem" } });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "900" } });

    fireEvent.click(screen.getByText("Salvar"));
    expect(await screen.findByText("Salvando...")).toBeTruthy();
    fireEvent.click(screen.getByText("Salvando..."));
    expect(mockFinance.savePriority).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();

    resolveSave();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("a failed save keeps the dialog open and shows the error, never a silent failure", async () => {
    mockFinance.savePriority.mockRejectedValue(new Error("Falha ao salvar a prioridade."));
    const onOpenChange = vi.fn();
    render(<PriorityDialog open={true} onOpenChange={onOpenChange} editingId={null} />);
    fireEvent.change(screen.getByLabelText("Item"), { target: { value: "Viagem" } });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "900" } });

    fireEvent.click(screen.getByText("Salvar"));
    expect(await screen.findByText("Falha ao salvar a prioridade.")).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe("PeopleDialog — salvar (perfis financeiros)", () => {
  it("does not close before savePeople resolves; blocks double-submit", async () => {
    let resolveSave: () => void = () => {};
    mockFinance.savePeople.mockImplementation(
      () => new Promise<void>((resolve) => (resolveSave = resolve)),
    );
    const onOpenChange = vi.fn();
    render(<PeopleDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByText("Salvar"));
    expect(await screen.findByText("Salvando...")).toBeTruthy();
    fireEvent.click(screen.getByText("Salvando..."));
    expect(mockFinance.savePeople).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();

    resolveSave();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("a failed save keeps the dialog open and shows the error", async () => {
    mockFinance.savePeople.mockRejectedValue(new Error("Falha ao salvar os perfis."));
    const onOpenChange = vi.fn();
    render(<PeopleDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByText("Salvar"));
    expect(await screen.findByText("Falha ao salvar os perfis.")).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
