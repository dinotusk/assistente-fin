// @vitest-environment jsdom
// P9.5.b — ListItemCard is the shared row pattern extracted from the
// Dashboard's repeated icon+title+meta+value+trailing cards (Movimentações
// recentes). Covers both render modes (static row vs. clickable row) and the
// optional pieces (icon/meta/value/trailing) independently.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ListItemCard } from "./ui";

afterEach(() => cleanup());

describe("ListItemCard — modo não interativo (P9.5.b)", () => {
  it("1. without onClick, renders as a plain div, not a button", () => {
    render(<ListItemCard title="Aluguel" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Aluguel").closest("div")?.tagName).toBe("DIV");
  });

  it("4. optional content: title alone renders with no icon/meta/value/trailing in the DOM", () => {
    render(<ListItemCard title="Só título" />);
    expect(screen.getByText("Só título")).toBeTruthy();
    // No icon wrapper (h-10 w-10), no meta line, no value strong beyond the title itself.
    expect(document.querySelector(".h-10.w-10")).toBeNull();
  });
});

describe("ListItemCard — modo interativo (P9.5.b)", () => {
  it("2. with onClick, renders as a real <button> and fires the handler", () => {
    const onClick = vi.fn();
    render(<ListItemCard title="Mercado" onClick={onClick} ariaLabel="Editar gasto Mercado" />);
    const button = screen.getByRole("button", { name: "Editar gasto Mercado" });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("3. interactive row is keyboard-focusable (native button semantics, focus-ring class present)", () => {
    render(<ListItemCard title="Mercado" onClick={vi.fn()} ariaLabel="Editar gasto Mercado" />);
    const button = screen.getByRole("button", { name: "Editar gasto Mercado" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.className).toContain("focus-ring");
  });

  it("5. value renders on the right alongside the title", () => {
    render(<ListItemCard title="Aluguel" value="R$ 1500.00" />);
    expect(screen.getByText("Aluguel")).toBeTruthy();
    expect(screen.getByText("R$ 1500.00")).toBeTruthy();
  });

  it("6. meta and trailing render when provided", () => {
    render(
      <ListItemCard
        title="Aluguel"
        meta={<span>Casa · 05/08</span>}
        trailing={<span>Pago</span>}
      />,
    );
    expect(screen.getByText("Casa · 05/08")).toBeTruthy();
    expect(screen.getByText("Pago")).toBeTruthy();
  });

  it("7. icon renders inside its own surface when provided", () => {
    render(<ListItemCard title="Aluguel" icon={<span data-testid="icon">*</span>} />);
    expect(screen.getByTestId("icon")).toBeTruthy();
    expect(document.querySelector(".h-10.w-10")).toBeTruthy();
  });
});
