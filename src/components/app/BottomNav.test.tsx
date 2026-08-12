// @vitest-environment jsdom
// P0-FRONTEND-1B.7 — the bottom nav is now the strongest glass tier
// (glass-nav) with a floating-capsule feel, the active tab reads as a
// "lens" (glass-active + small scale, no second backdrop-filter), and the
// center button uses the real Aval brand mark instead of a generic
// sparkles icon. This file checks structure/behavior, not exact pixels.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ViewKey } from "@/lib/finance/types";

import { BottomNav } from "./BottomNav";

afterEach(() => cleanup());

describe("BottomNav — navegação", () => {
  it("1. renders exactly the 5 expected tabs", () => {
    render(<BottomNav view="dashboard" onChange={vi.fn()} onOpenAssistant={vi.fn()} />);
    ["Painel", "Gastos", "Metas", "Aval", "Config"].forEach((label) => {
      // "Aval" has no visible text label (it's the center brand button),
      // so check it via its aria-label instead of getByText for that one.
      if (label === "Aval") {
        expect(screen.getByLabelText("Conversar com o Aval")).toBeTruthy();
      } else {
        expect(screen.getByText(label)).toBeTruthy();
      }
    });
  });

  it("2. clicking Gastos calls onChange with 'transactions'", () => {
    const onChange = vi.fn();
    render(<BottomNav view="dashboard" onChange={onChange} onOpenAssistant={vi.fn()} />);
    fireEvent.click(screen.getByText("Gastos"));
    expect(onChange).toHaveBeenCalledWith("transactions");
  });

  it("3. clicking the center button calls onOpenAssistant", () => {
    const onOpenAssistant = vi.fn();
    render(<BottomNav view="dashboard" onChange={vi.fn()} onOpenAssistant={onOpenAssistant} />);
    fireEvent.click(screen.getByLabelText("Conversar com o Aval"));
    expect(onOpenAssistant).toHaveBeenCalledTimes(1);
  });

  it("4. every item is a real, keyboard-focusable button", () => {
    render(<BottomNav view="dashboard" onChange={vi.fn()} onOpenAssistant={vi.fn()} />);
    ["Painel", "Gastos", "Metas", "Config"].forEach((label) => {
      expect(screen.getByText(label).closest("button")).toBeTruthy();
    });
    expect(screen.getByLabelText("Conversar com o Aval").tagName).toBe("BUTTON");
  });
});

describe("BottomNav — estado ativo", () => {
  it("5. the active item is marked via aria-current, not just styling", () => {
    render(<BottomNav view="transactions" onChange={vi.fn()} onOpenAssistant={vi.fn()} />);
    const gastosButton = screen.getByText("Gastos").closest("button");
    expect(gastosButton?.getAttribute("aria-current")).toBe("page");
    const painelButton = screen.getByText("Painel").closest("button");
    expect(painelButton?.getAttribute("aria-current")).toBeNull();
  });

  it("6. the active item's pill carries glass-active and a small scale — not color alone", () => {
    render(<BottomNav view="priorities" onChange={vi.fn()} onOpenAssistant={vi.fn()} />);
    const metasButton = screen.getByText("Metas").closest("button");
    const pill = metasButton?.querySelector("span");
    expect(pill?.className).toContain("glass-active");
    expect(pill?.className).toContain("scale-105");
  });

  it("7. an inactive item's pill does not carry glass-active", () => {
    render(<BottomNav view="priorities" onChange={vi.fn()} onOpenAssistant={vi.fn()} />);
    const painelButton = screen.getByText("Painel").closest("button");
    const pill = painelButton?.querySelector("span");
    expect(pill?.className).not.toContain("glass-active");
    expect(pill?.className).toContain("scale-100");
  });

  it("8. the Aval center button reflects the active view via aria-current", () => {
    render(<BottomNav view="assistant" onChange={vi.fn()} onOpenAssistant={vi.fn()} />);
    expect(screen.getByLabelText("Conversar com o Aval").getAttribute("aria-current")).toBe("page");
  });

  // P0-FRONTEND-1B.7.1 — walking the whole tab cycle, exactly one tab may
  // ever own the active state at a time. Asserted on the declarative class /
  // aria state, not on measured pixels: jsdom does not lay out or composite,
  // so a real scale value is not observable here (and a real browser settles
  // it asynchronously after the incoming view renders).
  it("14. across the full tab cycle, exactly one item is active and scaled up", () => {
    const CYCLE: { view: ViewKey; label: string }[] = [
      { view: "dashboard", label: "Painel" },
      { view: "transactions", label: "Gastos" },
      { view: "priorities", label: "Metas" },
      { view: "assistant", label: "Aval" },
      { view: "settings", label: "Config" },
      { view: "dashboard", label: "Painel" },
    ];
    const TABS = ["Painel", "Gastos", "Metas", "Config"];

    for (const step of CYCLE) {
      const { unmount } = render(
        <BottomNav view={step.view} onChange={vi.fn()} onOpenAssistant={vi.fn()} />,
      );

      const scaledUp = TABS.filter((label) => {
        const pill = screen.getByText(label).closest("button")?.querySelector("span");
        return pill?.className.includes("scale-105");
      });
      const marked = TABS.filter(
        (label) =>
          screen.getByText(label).closest("button")?.getAttribute("aria-current") === "page",
      );
      const avalActive =
        screen.getByLabelText("Conversar com o Aval").getAttribute("aria-current") === "page";

      // The previously active tab never keeps its scale: on the Aval step no
      // tab pill is scaled at all, otherwise exactly the incoming one is.
      const expected = step.label === "Aval" ? [] : [step.label];
      expect(scaledUp).toEqual(expected);
      expect(marked).toEqual(expected);
      expect(avalActive).toBe(step.label === "Aval");

      // Every tab that is not the active one is explicitly held at scale-100.
      TABS.filter((l) => l !== step.label).forEach((label) => {
        const pill = screen.getByText(label).closest("button")?.querySelector("span");
        expect(pill?.className).toContain("scale-100");
        expect(pill?.className).not.toContain("glass-active");
      });

      unmount();
    }
  });
});

describe("BottomNav — Aval Glass / marca (P0-FRONTEND-1B.7)", () => {
  it("9. the container carries the glass-nav utility (single strongest tier)", () => {
    render(<BottomNav view="dashboard" onChange={vi.fn()} onOpenAssistant={vi.fn()} />);
    const container = screen.getByText("Painel").closest("button")?.parentElement;
    expect(container?.className).toContain("glass-nav");
  });

  it("10. only the container carries a glass surface utility — no tab/pill has its own", () => {
    render(<BottomNav view="dashboard" onChange={vi.fn()} onOpenAssistant={vi.fn()} />);
    const container = screen.getByText("Painel").closest("button")?.parentElement as HTMLElement;
    const glassSurfaces = Array.from(container.querySelectorAll("*")).filter((el) =>
      /\bglass-(surface|nav)\b/.test(el.className as string),
    );
    // Zero descendants of the nav capsule carry a surface-level glass class
    // (glass-active is a fill/border/highlight only, never a surface tier).
    expect(glassSurfaces.length).toBe(0);
  });

  it("11. the center Aval button renders the real brand mark, not a generic icon", () => {
    render(<BottomNav view="dashboard" onChange={vi.fn()} onOpenAssistant={vi.fn()} />);
    const avalButton = screen.getByLabelText("Conversar com o Aval");
    const svg = avalButton.querySelector("svg");
    // AvalMark's own viewBox ("0 0 32 32") is its signature — lucide icons
    // (including the old Sparkles) all use "0 0 24 24".
    expect(svg?.getAttribute("viewBox")).toBe("0 0 32 32");
  });
});

describe("BottomNav — estrutura / safe-area / touch", () => {
  it("12. the safe-area bottom padding is still applied on the outer nav", () => {
    render(<BottomNav view="dashboard" onChange={vi.fn()} onOpenAssistant={vi.fn()} />);
    const nav = screen.getByLabelText("Navegação principal");
    expect(nav.className).toContain("safe-area-inset-bottom");
  });

  it("13. touch targets stay at least 44px tall (min-h-12 = 48px)", () => {
    render(<BottomNav view="dashboard" onChange={vi.fn()} onOpenAssistant={vi.fn()} />);
    const painelButton = screen.getByText("Painel").closest("button");
    expect(painelButton?.className).toContain("min-h-12");
  });
});
