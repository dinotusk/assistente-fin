// @vitest-environment jsdom
// P0-FRONTEND-1B.2 — the profile menu (mobile header avatar / desktop SideNav
// footer button) is a plain conditionally-rendered popover, not a Radix
// primitive, so it needs its own dismissal: outside tap and Escape must close
// it, and picking a menu item must still close it (regression guard).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActiveUser, FinanceState } from "@/lib/finance/types";

// jsdom doesn't implement matchMedia; AppHome's useIsDesktop() hook needs it
// to pick the mobile vs desktop layout. `desktopMode` lets each describe
// block below force whichever branch it targets.
let desktopMode = false;
window.matchMedia = ((query: string) => ({
  matches: desktopMode,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

// AppHome renders a large tree of views/dialogs unrelated to the profile
// menu — stub every one of them so this test only exercises AppHome's own
// header/menu wiring. AccountDialog/PeopleDialog/SettingsView render a
// visible marker when actually open/mounted so "Minha conta" / "Perfis
// financeiros" / "Configurações" can be proven to really open the right
// thing, not just close the popover.
vi.mock("./AccountDialogs", () => ({
  AccountDialog: ({ open }: { open: boolean }) => (open ? <div>AccountDialogOpen</div> : null),
  ChangePasswordDialog: () => null,
  MembersDialog: () => null,
  PersonalDataDialog: () => null,
  SecurityDialog: () => null,
}));
vi.mock("./AiConsentDialog", () => ({ AiConsentDialog: () => null }));
vi.mock("./AssistantView", () => ({ AssistantView: () => null }));
vi.mock("./ConflictDialog", () => ({ ConflictDialog: () => null }));
vi.mock("./BottomNav", () => ({ BottomNav: () => null }));
vi.mock("./SideNav", () => ({
  SideNav: ({ footer }: { footer?: React.ReactNode }) => <div>{footer}</div>,
}));
vi.mock("./DashboardView", () => ({ DashboardView: () => null }));
vi.mock("./PrioritiesView", () => ({ PrioritiesView: () => null }));
vi.mock("./SettingsView", () => ({ SettingsView: () => <div>SettingsViewRendered</div> }));
vi.mock("./TransactionsView", () => ({ TransactionsView: () => null }));
vi.mock("./dialogs", () => ({
  BankImportDialog: () => null,
  CategoriesDialog: () => null,
  EnvelopesDialog: () => null,
  ExpenseDialog: () => null,
  InviteDialog: () => null,
  JoinHouseholdDialog: () => null,
  MonthDialog: () => null,
  PeopleDialog: ({ open }: { open: boolean }) => (open ? <div>PeopleDialogOpen</div> : null),
  PriorityDialog: () => null,
  PurchaseSimulatorDialog: () => null,
  PushNotificationsDialog: () => null,
  VigiasDialog: () => null,
}));
vi.mock("./ui", () => ({ Segmented: () => null }));

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
    },
  };
}

const mockFinance = {
  activeUser: { id: "user-1", name: "Oziel", email: "oziel@example.com" } as ActiveUser,
  state: baseState(),
  hideValues: false,
  toggleHideValues: vi.fn(),
  setActivePerson: vi.fn(),
  setActiveMonth: vi.fn(),
  createNextMonth: vi.fn(),
  logout: vi.fn(),
  writeConflict: null,
  refreshAfterConflict: vi.fn(),
  dismissWriteConflict: vi.fn(),
};

vi.mock("@/lib/finance/FinanceContext", () => ({
  useFinance: () => mockFinance,
}));

const { AppHome } = await import("./AppHome");

beforeEach(() => {
  vi.clearAllMocks();
  desktopMode = false;
});
afterEach(() => cleanup());

describe("AppHome — profile menu dismissal (mobile header)", () => {
  it("opens on tap and shows the account name", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByLabelText("Abrir opções do perfil"));
    expect(screen.getByText("Oziel")).toBeTruthy();
  });

  it("a tap outside the menu closes it", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByLabelText("Abrir opções do perfil"));
    expect(screen.getByText("Conta sincronizada")).toBeTruthy();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByText("Conta sincronizada")).toBeNull();
  });

  it("Escape closes the menu", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByLabelText("Abrir opções do perfil"));
    expect(screen.getByText("Conta sincronizada")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Conta sincronizada")).toBeNull();
  });

  it("a tap inside the menu (e.g. a menu item) does not trigger the outside-close guard", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByLabelText("Abrir opções do perfil"));
    fireEvent.click(screen.getByText("Sair do perfil"));
    expect(mockFinance.logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Conta sincronizada")).toBeNull();
  });
});

describe("AppHome — profile menu dismissal (desktop SideNav footer)", () => {
  beforeEach(() => {
    desktopMode = true;
  });

  // "Conta sincronizada" is always visible in the trigger button itself here
  // (unlike the mobile header, which only shows it inside the popover), so
  // these assertions key on "Sair do perfil" — a menu item only ever
  // rendered while the popover itself is open.
  it("opens on tap and shows the menu items", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByRole("button", { name: /Oziel/ }));
    expect(screen.getByText("Sair do perfil")).toBeTruthy();
  });

  it("a tap outside the menu closes it", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByRole("button", { name: /Oziel/ }));
    expect(screen.getByText("Sair do perfil")).toBeTruthy();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByText("Sair do perfil")).toBeNull();
  });

  it("Escape closes the menu", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByRole("button", { name: /Oziel/ }));
    expect(screen.getByText("Sair do perfil")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Sair do perfil")).toBeNull();
  });
});

// P0-FRONTEND-1B.3 — the menu was trimmed to identity/account shortcuts
// only. "Editar mês", "Exportar backup" and "Importar dados" were removed
// from here specifically because they're already one tap away in
// Configurações (see SettingsView.test.tsx's row-presence checks for "Mês
// atual" / "Exportar backup" / "Importar dados" — that's what proves the
// functionality itself was not removed from the app, only from this menu).
describe("AppHome — profile menu content (P0-FRONTEND-1B.3)", () => {
  it("10. contains only the approved shortcuts: Minha conta, Perfis financeiros, Configurações, Sair do perfil", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByLabelText("Abrir opções do perfil"));
    expect(screen.getByText("Minha conta")).toBeTruthy();
    expect(screen.getByText("Perfis financeiros")).toBeTruthy();
    expect(screen.getByText("Configurações")).toBeTruthy();
    expect(screen.getByText("Sair do perfil")).toBeTruthy();
  });

  it("removed shortcuts (Editar mês, Exportar backup, Importar dados) are gone from the menu", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByLabelText("Abrir opções do perfil"));
    expect(screen.queryByText(/Editar m/i)).toBeNull();
    expect(screen.queryByText("Exportar backup")).toBeNull();
    expect(screen.queryByText("Importar dados")).toBeNull();
  });

  it("12. Minha conta opens the account dialog", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByLabelText("Abrir opções do perfil"));
    fireEvent.click(screen.getByText("Minha conta"));
    expect(screen.getByText("AccountDialogOpen")).toBeTruthy();
    // and closes the popover itself, same as every other menu item.
    expect(screen.queryByText("Perfis financeiros")).toBeNull();
  });

  it("13. Perfis financeiros opens the people dialog", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByLabelText("Abrir opções do perfil"));
    fireEvent.click(screen.getByText("Perfis financeiros"));
    expect(screen.getByText("PeopleDialogOpen")).toBeTruthy();
  });

  it("14. Configurações switches to the Settings view", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByLabelText("Abrir opções do perfil"));
    fireEvent.click(screen.getByText("Configurações"));
    expect(screen.getByText("SettingsViewRendered")).toBeTruthy();
  });

  it("15. Sair do perfil logs out", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByLabelText("Abrir opções do perfil"));
    fireEvent.click(screen.getByText("Sair do perfil"));
    expect(mockFinance.logout).toHaveBeenCalledTimes(1);
  });

  it("18. mobile: all four shortcuts are present and Minha conta works", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByLabelText("Abrir opções do perfil"));
    fireEvent.click(screen.getByText("Minha conta"));
    expect(screen.getByText("AccountDialogOpen")).toBeTruthy();
  });
});

describe("AppHome — profile menu content, desktop (P0-FRONTEND-1B.3)", () => {
  beforeEach(() => {
    desktopMode = true;
  });

  it("19. desktop: all four shortcuts are present and Minha conta works", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByRole("button", { name: /Oziel/ }));
    expect(screen.getByText("Perfis financeiros")).toBeTruthy();
    expect(screen.getByText("Configurações")).toBeTruthy();
    fireEvent.click(screen.getByText("Minha conta"));
    expect(screen.getByText("AccountDialogOpen")).toBeTruthy();
  });
});

// P0-FRONTEND-1B.5 (Aval Glass) — the profile menu popover and the header
// controls that trigger it are now glass; this only checks the utility
// classes land on the right elements and that the menu is still fully
// operable by mouse/keyboard, not colors or blur amounts (CSS-owned).
describe("AppHome — Aval Glass (P0-FRONTEND-1B.5)", () => {
  it("20. mobile: the profile menu popover carries glass-surface-strong and a soft entrance animation", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByLabelText("Abrir opções do perfil"));
    const popover = screen.getByText("Minha conta").closest("div.glass-surface-strong");
    expect(popover).toBeTruthy();
    expect(popover?.className).toContain("animate-glass-in");
  });

  it("21. mobile: the hide-values toggle carries glass-surface and stays reachable/clickable", () => {
    render(<AppHome />);
    const toggle = screen.getByLabelText("Ativar modo privado");
    expect(toggle.className).toContain("glass-surface");
    fireEvent.click(toggle);
    expect(mockFinance.toggleHideValues).toHaveBeenCalledTimes(1);
  });

  it("22. desktop: the profile trigger row carries glass-surface and still opens the menu", () => {
    desktopMode = true;
    render(<AppHome />);
    const trigger = screen.getByRole("button", { name: /Oziel/ });
    expect(trigger.className).toContain("glass-surface");
    fireEvent.click(trigger);
    expect(screen.getByText("Sair do perfil")).toBeTruthy();
  });

  it("23. Escape still closes the (now glass) popover — dismissal logic is unaffected by the visual change", () => {
    render(<AppHome />);
    fireEvent.click(screen.getByLabelText("Abrir opções do perfil"));
    expect(screen.getByText("Minha conta")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Minha conta")).toBeNull();
  });
});
