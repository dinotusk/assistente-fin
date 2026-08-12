// @vitest-environment jsdom
// P0-FRONTEND-1B.5 (Aval Glass) — the bottom nav's container and active-item
// pill are now glass (glass-surface-strong / glass-active) instead of the
// old near-solid bg-popover/95 + a color-only dot. This file checks the
// navigation still works and the active state is structurally correct —
// not exact pixels/colors, which CSS custom properties already own.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BottomNav } from "./BottomNav";

afterEach(() => cleanup());

describe("BottomNav — navegação (P0-FRONTEND-1B.5 regressão)", () => {
  it("1. clicking Gastos calls onChange with 'transactions'", () => {
    const onChange = vi.fn();
    render(<BottomNav view="dashboard" onChange={onChange} onOpenAssistant={vi.fn()} />);
    fireEvent.click(screen.getByText("Gastos"));
    expect(onChange).toHaveBeenCalledWith("transactions");
  });

  it("2. clicking the center button calls onOpenAssistant", () => {
    const onOpenAssistant = vi.fn();
    render(<BottomNav view="dashboard" onChange={vi.fn()} onOpenAssistant={onOpenAssistant} />);
    fireEvent.click(screen.getByLabelText("Conversar com o Aval"));
    expect(onOpenAssistant).toHaveBeenCalledTimes(1);
  });

  it("3. every item is a real, keyboard-focusable button", () => {
    render(<BottomNav view="dashboard" onChange={vi.fn()} onOpenAssistant={vi.fn()} />);
    ["Painel", "Gastos", "Metas", "Config"].forEach((label) => {
      expect(screen.getByText(label).closest("button")).toBeTruthy();
    });
  });
});

describe("BottomNav — estado ativo (P0-FRONTEND-1B.5)", () => {
  it("4. the active item is marked via aria-current, not just styling", () => {
    render(<BottomNav view="transactions" onChange={vi.fn()} onOpenAssistant={vi.fn()} />);
    const gastosButton = screen.getByText("Gastos").closest("button");
    expect(gastosButton?.getAttribute("aria-current")).toBe("page");
    const painelButton = screen.getByText("Painel").closest("button");
    expect(painelButton?.getAttribute("aria-current")).toBeNull();
  });

  it("5. the active item's icon pill carries the glass-active class — not color alone", () => {
    render(<BottomNav view="priorities" onChange={vi.fn()} onOpenAssistant={vi.fn()} />);
    const metasButton = screen.getByText("Metas").closest("button");
    const pill = metasButton?.querySelector("span");
    expect(pill?.className).toContain("glass-active");
  });

  it("6. an inactive item's pill does not carry glass-active", () => {
    render(<BottomNav view="priorities" onChange={vi.fn()} onOpenAssistant={vi.fn()} />);
    const painelButton = screen.getByText("Painel").closest("button");
    const pill = painelButton?.querySelector("span");
    expect(pill?.className).not.toContain("glass-active");
  });

  it("7. the Aval center button reflects the active view via aria-current", () => {
    render(<BottomNav view="assistant" onChange={vi.fn()} onOpenAssistant={vi.fn()} />);
    expect(screen.getByLabelText("Conversar com o Aval").getAttribute("aria-current")).toBe("page");
  });
});

describe("BottomNav — estrutura (P0-FRONTEND-1B.5)", () => {
  it("8. the container carries the glass-surface-strong utility", () => {
    render(<BottomNav view="dashboard" onChange={vi.fn()} onOpenAssistant={vi.fn()} />);
    const container = screen.getByText("Painel").closest("button")?.parentElement;
    expect(container?.className).toContain("glass-surface-strong");
  });

  it("9. the safe-area bottom padding is still applied on the outer nav", () => {
    render(<BottomNav view="dashboard" onChange={vi.fn()} onOpenAssistant={vi.fn()} />);
    const nav = screen.getByLabelText("Navegação principal");
    expect(nav.className).toContain("safe-area-inset-bottom");
  });

  it("10. touch targets stay at least 44px tall (min-h-12 = 48px)", () => {
    render(<BottomNav view="dashboard" onChange={vi.fn()} onOpenAssistant={vi.fn()} />);
    const painelButton = screen.getByText("Painel").closest("button");
    expect(painelButton?.className).toContain("min-h-12");
  });
});
