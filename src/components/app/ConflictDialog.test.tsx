// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// SheetShell wraps vaul's Drawer, which needs browser APIs jsdom doesn't
// implement (ResizeObserver, etc.). Swapped for a plain conditional render so
// this test exercises ConflictDialog's own copy/wiring, not vaul's internals.
vi.mock("./dialogs", () => ({
  SheetShell: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
}));

const { ConflictDialog } = await import("./ConflictDialog");

afterEach(() => cleanup());

describe("ConflictDialog", () => {
  it("renders nothing when closed", () => {
    render(<ConflictDialog open={false} onRefresh={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.queryByText(/Este registro mudou/)).toBeNull();
  });

  it("shows only the neutral copy — no stack trace, no technical error message", () => {
    render(<ConflictDialog open={true} onRefresh={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText(/Este registro mudou ou não está mais disponível\./)).toBeTruthy();
    expect(screen.getByText(/Atualize os dados para ver a versão mais recente/)).toBeTruthy();
    expect(screen.queryByText(/WriteNotAppliedError/)).toBeNull();
    expect(screen.queryByText(/outro dispositivo/)).toBeNull();
    expect(screen.queryByText(/at update/)).toBeNull();
  });

  it("never claims the data was already refreshed before the user clicks Atualizar dados", () => {
    render(<ConflictDialog open={true} onRefresh={vi.fn()} onDismiss={vi.fn()} />);
    // Regression guard: the copy used to say "Atualizamos os dados mais
    // recentes" (past tense) even though nothing had been refreshed yet.
    expect(screen.queryByText(/Atualizamos os dados/)).toBeNull();
    expect(screen.queryByText(/já (foram|foi) atualizado/i)).toBeNull();
  });

  it('"Atualizar dados" calls onRefresh, not onDismiss', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const onDismiss = vi.fn();
    render(<ConflictDialog open={true} onRefresh={onRefresh} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("Atualizar dados"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('"Fechar" calls onDismiss, not onRefresh', () => {
    const onRefresh = vi.fn();
    const onDismiss = vi.fn();
    render(<ConflictDialog open={true} onRefresh={onRefresh} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("Fechar"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("offers exactly two actions — no automatic-merge option", () => {
    render(<ConflictDialog open={true} onRefresh={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("a successful refresh shows no error and leaves the button re-enabled", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<ConflictDialog open={true} onRefresh={onRefresh} onDismiss={vi.fn()} />);

    fireEvent.click(screen.getByText("Atualizar dados"));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));

    expect(screen.queryByText(/Não foi possível atualizar/)).toBeNull();
    await waitFor(() =>
      expect((screen.getByText("Atualizar dados") as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it("a failed refresh shows an error, re-enables the button, and does not crash or close", async () => {
    const onRefresh = vi.fn().mockRejectedValue(new Error("network down"));
    const onDismiss = vi.fn();
    render(<ConflictDialog open={true} onRefresh={onRefresh} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByText("Atualizar dados"));

    await waitFor(() => expect(screen.getByText(/Não foi possível atualizar/)).toBeTruthy());
    // Button recovered — not stuck disabled/spinning.
    const button = screen.getByText("Atualizar dados") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    // The dialog itself doesn't auto-close on failure — only onDismiss/success do that.
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByText(/Este registro mudou/)).toBeTruthy();
  });

  it("reopening for a new conflict clears a stale error from a previous failed refresh", async () => {
    const onRefresh = vi.fn().mockRejectedValue(new Error("network down"));
    const { rerender } = render(
      <ConflictDialog open={true} onRefresh={onRefresh} onDismiss={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("Atualizar dados"));
    await waitFor(() => expect(screen.getByText(/Não foi possível atualizar/)).toBeTruthy());

    rerender(<ConflictDialog open={false} onRefresh={onRefresh} onDismiss={vi.fn()} />);
    rerender(<ConflictDialog open={true} onRefresh={onRefresh} onDismiss={vi.fn()} />);

    expect(screen.queryByText(/Não foi possível atualizar/)).toBeNull();
  });

  // P0-FRONTEND-1B.6 — same footer normalization as ConfirmDialog.
  it("the footer carries glass-surface (P0-FRONTEND-1B.6)", () => {
    render(<ConflictDialog open={true} onRefresh={vi.fn()} onDismiss={vi.fn()} />);
    const footer = screen.getByText("Fechar").closest("div");
    expect(footer?.className).toContain("glass-surface");
  });
});
