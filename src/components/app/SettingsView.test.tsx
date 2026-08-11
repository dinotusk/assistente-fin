// @vitest-environment jsdom
// P0-FRONTEND-1C.1 — Configurações reorganizada em seções (Conta/Casa/Dados/
// Assistente de IA/Sobre/Ações). This guards that every row that existed
// before the reorg is still reachable, and that the two new rows (Minha
// conta, Membros) are wired to their callbacks.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActiveUser } from "@/lib/finance/types";

const mockFinance = {
  activeUser: { id: "user-1", name: "Oziel", email: "oziel@example.com" } as ActiveUser,
  state: { people: ["Maria", "Oziel"] },
  exportData: vi.fn(),
  importData: vi
    .fn()
    .mockResolvedValue({ importedExpenses: 0, importedPriorities: 0, skipped: [], duplicates: 0 }),
  resetSeed: vi.fn(),
  logout: vi.fn(),
};
vi.mock("@/lib/finance/FinanceContext", () => ({ useFinance: () => mockFinance }));

const { SettingsView } = await import("./SettingsView");

function baseProps() {
  return {
    onOpenAccount: vi.fn(),
    onOpenMembers: vi.fn(),
    onEditPeople: vi.fn(),
    onEditMonth: vi.fn(),
    onEditCategories: vi.fn(),
    onImportBank: vi.fn(),
    onEditVigias: vi.fn(),
    onInvite: vi.fn(),
    onJoinHousehold: vi.fn(),
    onPushNotifications: vi.fn(),
    onAiConsent: vi.fn(),
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SettingsView — every pre-existing row is preserved after the reorg", () => {
  it.each([
    "Convidar para a casa",
    "Entrar em outra casa",
    "Perfis financeiros",
    "Mês atual",
    "Categorias",
    "Vigias",
    "Notificações push",
    "Assistente de IA",
    "Exportar backup",
    "Importar dados",
    "Importar extrato do banco",
    "Restaurar exemplo",
    "Sair do perfil",
  ])("renders the existing row %s", (title) => {
    render(<SettingsView {...baseProps()} />);
    // "Assistente de IA" is both a section label and its only row's title —
    // getAllByText tolerates that without asserting away the section header.
    expect(screen.getAllByText(title).length).toBeGreaterThan(0);
  });

  it("new rows Minha conta and Membros are present", () => {
    render(<SettingsView {...baseProps()} />);
    expect(screen.getByText("Minha conta")).toBeTruthy();
    expect(screen.getByText("Membros")).toBeTruthy();
  });

  it("Sobre section shows Termos e privacidade and the app version", () => {
    render(<SettingsView {...baseProps()} />);
    expect(screen.getByText("Termos e privacidade")).toBeTruthy();
    expect(screen.getByText("Versão do app")).toBeTruthy();
  });
});

describe("SettingsView — wiring calls the right callback", () => {
  it("Membros row calls onOpenMembers", () => {
    const props = baseProps();
    render(<SettingsView {...props} />);
    fireEvent.click(screen.getByText("Membros"));
    expect(props.onOpenMembers).toHaveBeenCalledTimes(1);
  });

  it("Minha conta row calls onOpenAccount", () => {
    const props = baseProps();
    render(<SettingsView {...props} />);
    fireEvent.click(screen.getByText("Minha conta"));
    expect(props.onOpenAccount).toHaveBeenCalledTimes(1);
  });

  it("the profile hero card also opens Minha conta", () => {
    const props = baseProps();
    render(<SettingsView {...props} />);
    fireEvent.click(screen.getByText("Oziel"));
    expect(props.onOpenAccount).toHaveBeenCalledTimes(1);
  });

  it("Sair do perfil still calls logout", () => {
    render(<SettingsView {...baseProps()} />);
    fireEvent.click(screen.getByText("Sair do perfil"));
    expect(mockFinance.logout).toHaveBeenCalledTimes(1);
  });
});

describe("SettingsView — identity header shows name and e-mail", () => {
  it("shows the account e-mail", () => {
    render(<SettingsView {...baseProps()} />);
    expect(screen.getByText("oziel@example.com")).toBeTruthy();
  });

  it("does not crash and shows a fallback when e-mail is null", () => {
    mockFinance.activeUser = { id: "user-1", name: "Oziel", email: null };
    render(<SettingsView {...baseProps()} />);
    expect(screen.getByText("E-mail não disponível")).toBeTruthy();
    mockFinance.activeUser = { id: "user-1", name: "Oziel", email: "oziel@example.com" };
  });
});

describe("SettingsView — Versão do app is informational, not a dead button", () => {
  it("is not rendered as a button (no click semantics for a display-only row)", () => {
    render(<SettingsView {...baseProps()} />);
    const row = screen.getByText("Versão do app").closest("button");
    expect(row).toBeNull();
  });
});
