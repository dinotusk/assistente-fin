// @vitest-environment jsdom
// P0-FRONTEND-1B.1 Etapa 5 — "Excluir mês" no longer uses window.confirm: it
// opens the shared ConfirmDialog with a title/description naming the real
// month, never fires on a single tap, shows loading while deleteMonth's
// promise is in flight, blocks double-submit, and keeps the dialog open with
// an error on failure. Also covers the main "Salvar" (saveMonthSettings)
// async save pattern for the same dialog.
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FinanceState } from "@/lib/finance/types";

// Real dialogs.tsx (MonthDialog under test) renders its own SheetShell AND
// ConfirmDialog (which also renders SheetShell) — both ultimately wrap
// @/components/ui/drawer's vaul Drawer, which needs browser APIs jsdom
// doesn't implement. Mock at the Drawer layer so both real SheetShell
// instances still render normally.
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
      "2026-07": {
        label: "Julho 2026",
        income: 4800,
        houseContribution: 900,
        expenses: [],
        priorities: [],
      },
    },
  };
}

const mockFinance = {
  month: baseState().months[MONTH],
  state: baseState(),
  saveMonthSettings: vi.fn().mockResolvedValue(undefined),
  deleteMonth: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/lib/finance/FinanceContext", () => ({
  useFinance: () => mockFinance,
}));

const { MonthDialog } = await import("./dialogs");

beforeEach(() => {
  vi.clearAllMocks();
  mockFinance.month = baseState().months[MONTH];
  mockFinance.state = baseState();
  mockFinance.saveMonthSettings.mockResolvedValue(undefined);
  mockFinance.deleteMonth.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe("MonthDialog — Excluir mês (ConfirmDialog, not window.confirm)", () => {
  it("11. the delete action exists as a real button", () => {
    render(<MonthDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("Excluir este mês")).toBeTruthy();
  });

  it("12. a single tap does not delete the month", () => {
    render(<MonthDialog open={true} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Excluir este mês"));
    expect(mockFinance.deleteMonth).not.toHaveBeenCalled();
  });

  it("13. Cancelar on the confirmation preserves the month", () => {
    render(<MonthDialog open={true} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Excluir este mês"));
    expect(screen.getByText("Excluir Agosto 2026?")).toBeTruthy();
    // Two "Cancelar" buttons are on screen at once here — the month-edit
    // form's own footer (still mounted underneath) and the confirmation's.
    // The confirmation's is the one rendered last in the DOM.
    const cancelButtons = screen.getAllByText("Cancelar");
    fireEvent.click(cancelButtons[cancelButtons.length - 1]);
    expect(mockFinance.deleteMonth).not.toHaveBeenCalled();
    expect(screen.queryByText("Excluir Agosto 2026?")).toBeNull();
  });

  it("14. the confirmation names the real active month, not a generic label", () => {
    render(<MonthDialog open={true} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Excluir este mês"));
    expect(screen.getByText("Excluir Agosto 2026?")).toBeTruthy();
    expect(
      screen.getByText(/Os gastos, metas e demais dados de Agosto 2026 serão removidos/),
    ).toBeTruthy();
  });

  it("15. Confirmar deletes only the active month key", async () => {
    render(<MonthDialog open={true} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Excluir este mês"));
    fireEvent.click(screen.getByText("Excluir mês"));
    await waitFor(() => expect(mockFinance.deleteMonth).toHaveBeenCalledWith(MONTH));
    expect(mockFinance.deleteMonth).not.toHaveBeenCalledWith("2026-07");
  });

  it("16. shows loading/disabled state while deleteMonth is in flight, and blocks double-submit", async () => {
    let resolveDelete: () => void = () => {};
    mockFinance.deleteMonth.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    render(<MonthDialog open={true} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Excluir este mês"));
    fireEvent.click(screen.getByText("Excluir mês"));

    const busyButton = await screen.findByText("Excluindo...");
    expect((busyButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(busyButton);
    expect(mockFinance.deleteMonth).toHaveBeenCalledTimes(1);

    resolveDelete();
    await waitFor(() => expect(screen.queryByText("Excluindo...")).toBeNull());
  });

  it("a failed delete keeps the confirmation open with a visible error, never a silent close", async () => {
    mockFinance.deleteMonth.mockRejectedValue(new Error("Não foi possível excluir agora."));
    render(<MonthDialog open={true} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByText("Excluir este mês"));
    fireEvent.click(screen.getByText("Excluir mês"));

    expect(await screen.findByText("Não foi possível excluir agora.")).toBeTruthy();
    expect(screen.getByText("Excluir Agosto 2026?")).toBeTruthy();
  });

  it("the delete button is disabled when only one month exists", () => {
    mockFinance.state = { ...baseState(), months: { [MONTH]: baseState().months[MONTH] } };
    render(<MonthDialog open={true} onOpenChange={vi.fn()} />);
    expect((screen.getByText("Excluir este mês") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Não é possível excluir o único mês existente.")).toBeTruthy();
  });
});

describe("MonthDialog — salvar (async save pattern)", () => {
  it("32/33. does not close before saveMonthSettings resolves, and blocks double-submit", async () => {
    let resolveSave: () => void = () => {};
    mockFinance.saveMonthSettings.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const onOpenChange = vi.fn();
    render(<MonthDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByText("Salvar"));
    expect(await screen.findByText("Salvando...")).toBeTruthy();
    fireEvent.click(screen.getByText("Salvando..."));
    expect(mockFinance.saveMonthSettings).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();

    resolveSave();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("34/35. a failed save keeps the dialog open and shows the error, never a success toast", async () => {
    mockFinance.saveMonthSettings.mockRejectedValue(new Error("Falha ao salvar o mês."));
    const onOpenChange = vi.fn();
    render(<MonthDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByText("Salvar"));
    expect(await screen.findByText("Falha ao salvar o mês.")).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
