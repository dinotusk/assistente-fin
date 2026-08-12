// @vitest-environment jsdom
// P0-FRONTEND-1B.1 Etapa 2 — reusable ConfirmDialog: never fires on a single
// tap by itself (the caller decides when to open it), Cancelar never calls
// onConfirm, Confirmar shows a busy/disabled state and only closes after the
// promise resolves, and a rejected promise keeps the dialog open with a
// visible error instead of a silent or premature "success".
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./dialogs", () => ({
  SheetShell: ({ open, title, children }: { open: boolean; title: string; children: ReactNode }) =>
    open ? (
      <div>
        <h1>{title}</h1>
        {children}
      </div>
    ) : null,
}));

const { ConfirmDialog } = await import("./ConfirmDialog");

function baseProps(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    title: "Excluir gasto?",
    description: "Esse lançamento será removido deste mês.",
    confirmLabel: "Excluir gasto",
    onConfirm: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("ConfirmDialog", () => {
  it("renders nothing when closed — never fires on mount", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...baseProps({ open: false, onConfirm })} />);
    expect(screen.queryByText("Excluir gasto?")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("opening the dialog alone never calls onConfirm — a single tap on the trigger elsewhere must not delete", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...baseProps({ onConfirm })} />);
    expect(screen.getByText("Excluir gasto?")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Cancelar closes without ever calling onConfirm", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(<ConfirmDialog {...baseProps({ onConfirm, onOpenChange })} />);
    fireEvent.click(screen.getByText("Cancelar"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Confirmar calls onConfirm exactly once and closes only after it resolves", async () => {
    let resolveConfirm: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    const onOpenChange = vi.fn();
    render(<ConfirmDialog {...baseProps({ onConfirm, onOpenChange })} />);

    fireEvent.click(screen.getByText("Excluir gasto"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled(); // not yet — the promise hasn't settled

    resolveConfirm();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("shows a busy label and disables both buttons while the promise is in flight", async () => {
    let resolveConfirm: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    render(<ConfirmDialog {...baseProps({ onConfirm, busyLabel: "Excluindo..." })} />);

    fireEvent.click(screen.getByText("Excluir gasto"));
    expect(await screen.findByText("Excluindo...")).toBeTruthy();
    expect((screen.getByText("Cancelar") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText("Excluindo...") as HTMLButtonElement).disabled).toBe(true);

    resolveConfirm();
    await waitFor(() => expect(screen.queryByText("Excluindo...")).toBeNull());
  });

  it("a second tap while busy does not call onConfirm again (double-submit guard)", async () => {
    let resolveConfirm: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    render(<ConfirmDialog {...baseProps({ onConfirm })} />);

    fireEvent.click(screen.getByText("Excluir gasto"));
    await screen.findByText("Aguarde...");
    // The button is disabled now, but a stray extra click (e.g. a fast
    // double-tap that lands before the disabled attribute paints) must still
    // be a no-op — the handler itself guards on the busy flag, not just the
    // DOM disabled attribute.
    fireEvent.click(screen.getByText("Aguarde..."));
    fireEvent.click(screen.getByText("Aguarde..."));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    resolveConfirm();
    await waitFor(() => expect(screen.queryByText("Aguarde...")).toBeNull());
  });

  it("a rejected onConfirm keeps the dialog open, shows the error, and never calls onOpenChange", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Falha ao excluir. Tente novamente."));
    const onOpenChange = vi.fn();
    render(<ConfirmDialog {...baseProps({ onConfirm, onOpenChange })} />);

    fireEvent.click(screen.getByText("Excluir gasto"));
    expect(await screen.findByText("Falha ao excluir. Tente novamente.")).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText("Excluir gasto?")).toBeTruthy(); // dialog still open
  });

  it("the confirm button recovers (re-enabled, no longer busy) after a failure — can be retried", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("network down"));
    render(<ConfirmDialog {...baseProps({ onConfirm })} />);

    fireEvent.click(screen.getByText("Excluir gasto"));
    await waitFor(() => expect(screen.getByText("network down")).toBeTruthy());
    const button = screen.getByText("Excluir gasto") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("reopening after a previous failure clears the stale error", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("network down"));
    const { rerender } = render(<ConfirmDialog {...baseProps({ onConfirm })} />);
    fireEvent.click(screen.getByText("Excluir gasto"));
    await waitFor(() => expect(screen.getByText("network down")).toBeTruthy());

    rerender(<ConfirmDialog {...baseProps({ onConfirm, open: false })} />);
    rerender(<ConfirmDialog {...baseProps({ onConfirm, open: true })} />);

    expect(screen.queryByText("network down")).toBeNull();
  });

  it("dismissing (scrim/swipe) while busy is ignored — cannot be closed mid-write", async () => {
    let resolveConfirm: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    const onOpenChange = vi.fn();
    render(<ConfirmDialog {...baseProps({ onConfirm, onOpenChange })} />);

    fireEvent.click(screen.getByText("Excluir gasto"));
    await screen.findByText("Aguarde...");
    // Cancelar is disabled while busy, matching the SheetShell dismiss guard.
    expect((screen.getByText("Cancelar") as HTMLButtonElement).disabled).toBe(true);

    resolveConfirm();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  // P0-FRONTEND-1B.6 — the sticky footer is chrome (glass); the description
  // body and the destructive button are content/action, must stay solid so
  // the gravity of a destructive confirmation is never diluted.
  describe("Aval Glass (P0-FRONTEND-1B.6)", () => {
    it("the footer carries glass-surface", () => {
      render(<ConfirmDialog {...baseProps()} />);
      const footer = screen.getByText("Cancelar").closest("div");
      expect(footer?.className).toContain("glass-surface");
    });

    it("the destructive confirm button stays fully solid, never glass", () => {
      render(<ConfirmDialog {...baseProps()} />);
      const confirmButton = screen.getByText("Excluir gasto");
      expect(confirmButton.className).toContain("bg-destructive");
      expect(confirmButton.className).not.toMatch(/glass-/);
    });

    it("the description/body never carries a glass- utility", () => {
      render(<ConfirmDialog {...baseProps()} />);
      const description = screen.getByText("Esse lançamento será removido deste mês.");
      expect(description.className).not.toMatch(/glass-/);
    });
  });
});
