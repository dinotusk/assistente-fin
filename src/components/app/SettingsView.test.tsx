// @vitest-environment jsdom
// P0-FRONTEND-1C.1 — Configurações reorganizada em seções (Conta/Casa/Dados/
// Assistente de IA/Sobre/Ações). This guards that every row that existed
// before the reorg is still reachable, and that the two new rows (Minha
// conta, Membros) are wired to their callbacks.
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActiveUser } from "@/lib/finance/types";

// "Restaurar exemplo" now renders a real ConfirmDialog (via SheetShell ->
// vaul Drawer) — mock at the Drawer layer, same approach used everywhere
// else a real SheetShell needs to render inside jsdom.
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DrawerContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
}));

const mockFinance = {
  activeUser: { id: "user-1", name: "Oziel", email: "oziel@example.com" } as ActiveUser,
  state: { people: ["Maria", "Oziel"] },
  exportData: vi.fn(),
  importData: vi
    .fn()
    .mockResolvedValue({ importedExpenses: 0, importedPriorities: 0, skipped: [], duplicates: 0 }),
  resetSeed: vi.fn().mockResolvedValue(undefined),
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

describe("SettingsView — Restaurar exemplo (destructive, needs confirmation)", () => {
  it("27. tapping the row does not run resetSeed by itself", () => {
    render(<SettingsView {...baseProps()} />);
    fireEvent.click(screen.getByText("Restaurar exemplo"));
    expect(mockFinance.resetSeed).not.toHaveBeenCalled();
    expect(screen.getByText("Restaurar dados de exemplo?")).toBeTruthy();
  });

  it("28. Cancelar preserves the current data", () => {
    render(<SettingsView {...baseProps()} />);
    fireEvent.click(screen.getByText("Restaurar exemplo"));
    fireEvent.click(screen.getByText("Cancelar"));
    expect(mockFinance.resetSeed).not.toHaveBeenCalled();
  });

  it("29. Confirmar calls resetSeed", async () => {
    render(<SettingsView {...baseProps()} />);
    fireEvent.click(screen.getByText("Restaurar exemplo"));
    // Two elements now share this text: the settings row (still mounted
    // behind the confirmation) and the confirmation's own action button,
    // rendered after it in the DOM.
    const buttons = screen.getAllByText("Restaurar exemplo");
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(mockFinance.resetSeed).toHaveBeenCalledTimes(1));
  });

  it("30. shows loading/disabled state while resetSeed is in flight", async () => {
    let resolveReset: () => void = () => {};
    mockFinance.resetSeed.mockImplementation(
      () => new Promise<void>((resolve) => (resolveReset = resolve)),
    );
    render(<SettingsView {...baseProps()} />);
    fireEvent.click(screen.getByText("Restaurar exemplo"));
    // Two elements now share this text: the settings row (still mounted
    // behind the confirmation) and the confirmation's own action button,
    // rendered after it in the DOM.
    const buttons = screen.getAllByText("Restaurar exemplo");
    fireEvent.click(buttons[buttons.length - 1]);

    expect(await screen.findByText("Restaurando...")).toBeTruthy();
    expect((screen.getByText("Restaurando...") as HTMLButtonElement).disabled).toBe(true);

    resolveReset();
    await waitFor(() => expect(screen.queryByText("Restaurando...")).toBeNull());
    mockFinance.resetSeed.mockResolvedValue(undefined);
  });

  it("31. a failed reset keeps the confirmation open and shows an error, never a silent success", async () => {
    mockFinance.resetSeed.mockRejectedValue(new Error("Não foi possível restaurar agora."));
    render(<SettingsView {...baseProps()} />);
    fireEvent.click(screen.getByText("Restaurar exemplo"));
    // Two elements now share this text: the settings row (still mounted
    // behind the confirmation) and the confirmation's own action button,
    // rendered after it in the DOM.
    const buttons = screen.getAllByText("Restaurar exemplo");
    fireEvent.click(buttons[buttons.length - 1]);

    expect(await screen.findByText("Não foi possível restaurar agora.")).toBeTruthy();
    expect(screen.getByText("Restaurar dados de exemplo?")).toBeTruthy();
    mockFinance.resetSeed.mockResolvedValue(undefined);
  });
});
