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
// header/menu wiring.
vi.mock("./AccountDialogs", () => ({
  AccountDialog: () => null,
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
vi.mock("./SettingsView", () => ({ SettingsView: () => null }));
vi.mock("./TransactionsView", () => ({ TransactionsView: () => null }));
vi.mock("./dialogs", () => ({
  BankImportDialog: () => null,
  CategoriesDialog: () => null,
  EnvelopesDialog: () => null,
  ExpenseDialog: () => null,
  InviteDialog: () => null,
  JoinHouseholdDialog: () => null,
  MonthDialog: () => null,
  PeopleDialog: () => null,
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
  exportData: vi.fn(),
  importData: vi.fn(),
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
