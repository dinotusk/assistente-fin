// @vitest-environment jsdom
// P0-FRONTEND-1B.1 Etapa 4 — excluir prioridade follows the exact same
// confirm/loading/error contract as excluir gasto (Etapa 3).
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FinanceState } from "@/lib/finance/types";

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
        expenses: [],
        priorities: [
          {
            id: "pri-1",
            name: "Viagem",
            amount: 900,
            rank: 1,
            status: "A pagar",
            responsavel: "Maria",
          },
        ],
      },
    },
  };
}

const mockFinance = {
  month: baseState().months[MONTH],
  state: baseState(),
  togglePriorityStatus: vi.fn(),
  deletePriority: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/lib/finance/FinanceContext", () => ({
  useFinance: () => mockFinance,
  useMoney: () => (value: number) => `R$ ${value.toFixed(2)}`,
}));

const { PrioritiesView } = await import("./PrioritiesView");

beforeEach(() => {
  vi.clearAllMocks();
  mockFinance.month = baseState().months[MONTH];
  mockFinance.state = baseState();
  mockFinance.deletePriority.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe("PrioritiesView — excluir prioridade", () => {
  it("6. a single tap on Excluir does not delete the priority", () => {
    render(<PrioritiesView onEdit={vi.fn()} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Excluir"));
    expect(mockFinance.deletePriority).not.toHaveBeenCalled();
    expect(screen.getByText("Viagem")).toBeTruthy();
  });

  it("7. Cancelar preserves the priority untouched", () => {
    render(<PrioritiesView onEdit={vi.fn()} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Excluir"));
    fireEvent.click(screen.getByText("Cancelar"));
    expect(mockFinance.deletePriority).not.toHaveBeenCalled();
    expect(screen.getByText("Viagem")).toBeTruthy();
  });

  it("8. Confirmar calls deletePriority with the right id", async () => {
    render(<PrioritiesView onEdit={vi.fn()} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Excluir"));
    fireEvent.click(screen.getByText("Excluir prioridade"));
    await waitFor(() => expect(mockFinance.deletePriority).toHaveBeenCalledWith("pri-1"));
  });

  it("9. shows a loading/disabled state while the delete is in flight", async () => {
    let resolveDelete: () => void = () => {};
    mockFinance.deletePriority.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    render(<PrioritiesView onEdit={vi.fn()} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Excluir"));
    fireEvent.click(screen.getByText("Excluir prioridade"));

    expect(await screen.findByText("Excluindo...")).toBeTruthy();
    expect((screen.getByText("Excluindo...") as HTMLButtonElement).disabled).toBe(true);

    resolveDelete();
    await waitFor(() => expect(screen.queryByText("Excluir prioridade?")).toBeNull());
  });

  it("10. a failed delete keeps the confirmation open, shows an error, and the item is never removed", async () => {
    mockFinance.deletePriority.mockRejectedValue(new Error("Não foi possível excluir agora."));
    render(<PrioritiesView onEdit={vi.fn()} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Excluir"));
    fireEvent.click(screen.getByText("Excluir prioridade"));

    expect(await screen.findByText("Não foi possível excluir agora.")).toBeTruthy();
    expect(screen.getByText("Excluir prioridade?")).toBeTruthy();
    expect(screen.getByText("Viagem")).toBeTruthy();
  });
});
