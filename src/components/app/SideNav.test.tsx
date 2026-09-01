// @vitest-environment jsdom
// P0-FRONTEND-1B.7 — the desktop SideNav's "Aval" item used a generic House
// icon; it now renders the real Aval brand mark (AvalMark), matching the
// mobile bottom nav and the rest of the assistant surfaces. Navigation
// itself and the (untouched, pre-existing) SideNav own blur must keep
// working exactly as before — this round didn't touch that container.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SideNav } from "./SideNav";

afterEach(() => cleanup());

describe("SideNav — navegação", () => {
  it("1. renders all 5 nav items", () => {
    render(<SideNav view="dashboard" onChange={vi.fn()} />);
    ["Painel", "Gastos", "Metas", "Config"].forEach((label) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
    // "Aval" appears twice (brand header + nav item label) — just needs to exist.
    expect(screen.getAllByText("Aval").length).toBeGreaterThan(0);
  });

  it("2. clicking an item calls onChange with the right key", () => {
    const onChange = vi.fn();
    render(<SideNav view="dashboard" onChange={onChange} />);
    fireEvent.click(screen.getByText("Gastos"));
    expect(onChange).toHaveBeenCalledWith("transactions");
  });

  it("3. clicking the Aval item calls onChange with 'assistant'", () => {
    const onChange = vi.fn();
    render(<SideNav view="dashboard" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Aval" }));
    expect(onChange).toHaveBeenCalledWith("assistant");
  });

  it("4. renders the footer content passed in", () => {
    render(<SideNav view="dashboard" onChange={vi.fn()} footer={<div>Footer here</div>} />);
    expect(screen.getByText("Footer here")).toBeTruthy();
  });
});

describe("SideNav — marca Aval (P0-FRONTEND-1B.7)", () => {
  it("5. the Aval item renders the real brand mark, not a generic icon", () => {
    render(<SideNav view="dashboard" onChange={vi.fn()} />);
    const avalButton = screen.getByRole("button", { name: "Aval" });
    const svg = avalButton?.querySelector("svg");
    // AvalMark's own viewBox ("0 0 32 32") — lucide icons (including the
    // old House icon) all use "0 0 24 24".
    expect(svg?.getAttribute("viewBox")).toBe("0 0 32 32");
  });

  it("6. every other item keeps its own lucide icon (24x24 viewBox)", () => {
    render(<SideNav view="dashboard" onChange={vi.fn()} />);
    ["Painel", "Gastos", "Metas", "Config"].forEach((label) => {
      const button = screen.getByText(label).closest("button");
      const svg = button?.querySelector("svg");
      expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    });
  });
});

describe("SideNav — ícone Metas consistente com BottomNav (P9.4)", () => {
  it("7. Metas uses the same lucide Target glyph BottomNav.tsx uses, not Star", async () => {
    const { Target } = await import("lucide-react");
    render(<SideNav view="dashboard" onChange={vi.fn()} />);
    const button = screen.getByText("Metas").closest("button");
    const svg = button?.querySelector("svg");
    const { container: reference } = render(<Target />);
    const referenceSvg = reference.querySelector("svg");
    expect(svg?.innerHTML).toBe(referenceSvg?.innerHTML);
  });
});
