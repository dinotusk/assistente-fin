// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FinanceState, MonthData } from "./types";

const mockRepo = {
  createHouseholdInvite: vi.fn(),
  getAiConsentStatus: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  loadRemoteFinance: vi.fn(),
  loginWithGoogle: vi.fn(),
  loginWithSupabase: vi.fn(),
  logoutFromSupabase: vi.fn(),
  redeemInvite: vi.fn(),
  hasPushSubscription: vi.fn(),
  registerWithSupabase: vi.fn(),
  removePushSubscription: vi.fn(),
  revokeAiConsent: vi.fn(),
  saveAiConsent: vi.fn(),
  savePushSubscription: vi.fn(),
  saveRemoteEnvelopes: vi.fn(),
  saveRemoteFinance: vi.fn(),
  saveSessionPreference: vi.fn(),
};
vi.mock("./supabaseRepository", () => mockRepo);

const mockToast = { error: vi.fn(), success: vi.fn() };
vi.mock("sonner", () => ({ toast: mockToast }));

// Dynamic, not static: see the TDZ note in supabaseRepository.test.ts — the
// same applies here for both mocked modules above.
const { FinanceProvider, useFinance } = await import("./FinanceContext");

const MONTH_A = "2026-08";
const MONTH_B = "2026-09";

const FAKE_USER = { id: "user-1", email: "teste@example.com" };
const FAKE_WORKSPACE = { householdId: "household-1", profiles: [], months: [] };

function makeMonth(profileBudgets: Record<string, number> = {}): MonthData {
  return {
    label: "Mes",
    income: 0,
    houseContribution: 0,
    profileBudgets,
    expenses: [],
    priorities: [],
  };
}

function makeState(
  people: string[],
  budgetsByMonth: Record<string, Record<string, number>>,
): FinanceState {
  const monthKeys = Object.keys(budgetsByMonth).length ? Object.keys(budgetsByMonth) : [MONTH_A];
  const months: Record<string, MonthData> = {};
  for (const key of monthKeys) months[key] = makeMonth(budgetsByMonth[key]);
  return { people, activePerson: "eu", activeMonth: monthKeys[0], months };
}

function loadedFinance(state: FinanceState) {
  return {
    user: { id: FAKE_USER.id, name: "Teste" },
    state,
    workspace: FAKE_WORKSPACE,
    envelopes: [{ id: "env-1", label: "Outros", limit: 0, categories: ["Outros"] }],
  };
}

function Harness({ renameTo }: { renameTo: string[] }) {
  const { ready, state, savePeople, saveMonthSettings } = useFinance();
  if (!ready) return <div>carregando</div>;
  return (
    <div>
      <pre data-testid="months">{JSON.stringify(state.months)}</pre>
      <pre data-testid="people">{JSON.stringify(state.people)}</pre>
      <button onClick={() => savePeople(renameTo)}>rename</button>
      <button
        onClick={() => {
          const month = state.months[state.activeMonth];
          saveMonthSettings(month.label, month.income, month.houseContribution, {
            ...month.profileBudgets,
            [renameTo[1] ?? renameTo[0]]: 999,
          });
        }}
      >
        edit-budget-after-rename
      </button>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRepo.getAuthenticatedUser.mockResolvedValue(FAKE_USER);
  mockRepo.saveRemoteFinance.mockResolvedValue({
    workspace: FAKE_WORKSPACE,
    state: makeState([], {}),
  });
});

afterEach(() => cleanup());

async function renderReadyHarness(state: FinanceState, renameTo: string[]) {
  mockRepo.loadRemoteFinance.mockResolvedValue(loadedFinance(state));
  render(
    <FinanceProvider>
      <Harness renameTo={renameTo} />
    </FinanceProvider>,
  );
  await screen.findByText("rename");
}

function readMonths(): Record<string, MonthData> {
  return JSON.parse(screen.getByTestId("months").textContent!);
}

describe("savePeople — profile rename propagation to profileBudgets", () => {
  it("1. renaming a profile keeps its budget amount intact under the new name", async () => {
    await renderReadyHarness(
      makeState(["Minha casa", "Maria", "Ana"], { [MONTH_A]: { Ana: 300 } }),
      ["Minha casa", "Maria", "Ana Paula"],
    );
    fireEvent.click(screen.getByText("rename"));
    await waitFor(() => expect(readMonths()[MONTH_A].profileBudgets).toEqual({ "Ana Paula": 300 }));
  });

  it("2. renaming profile 0 or 1 (previously excluded) also propagates to profileBudgets", async () => {
    await renderReadyHarness(
      makeState(["Minha casa", "Maria"], { [MONTH_A]: { "Minha casa": 1000, Maria: 500 } }),
      ["Casa Nova", "Mari"],
    );
    fireEvent.click(screen.getByText("rename"));
    await waitFor(() =>
      expect(readMonths()[MONTH_A].profileBudgets).toEqual({ "Casa Nova": 1000, Mari: 500 }),
    );
  });

  it("3. renaming a profile with budgets in multiple months updates every month", async () => {
    await renderReadyHarness(
      makeState(["Minha casa", "Maria"], {
        [MONTH_A]: { Maria: 200 },
        [MONTH_B]: { Maria: 250 },
      }),
      ["Minha casa", "Mari"],
    );
    fireEvent.click(screen.getByText("rename"));
    await waitFor(() => {
      const months = readMonths();
      expect(months[MONTH_A].profileBudgets).toEqual({ Mari: 200 });
      expect(months[MONTH_B].profileBudgets).toEqual({ Mari: 250 });
    });
  });

  it("4. rename does not create a duplicate budget entry (old and new keys never coexist)", async () => {
    await renderReadyHarness(makeState(["Minha casa", "Maria"], { [MONTH_A]: { Maria: 400 } }), [
      "Minha casa",
      "Mari",
    ]);
    fireEvent.click(screen.getByText("rename"));
    await waitFor(() => {
      const budgets = readMonths()[MONTH_A].profileBudgets!;
      expect(Object.keys(budgets)).toEqual(["Mari"]);
      expect(budgets.Maria).toBeUndefined();
    });
  });

  it("5. rename does not erase the budget amount", async () => {
    await renderReadyHarness(makeState(["Minha casa", "Maria"], { [MONTH_A]: { Maria: 777 } }), [
      "Minha casa",
      "Mari",
    ]);
    fireEvent.click(screen.getByText("rename"));
    await waitFor(() => expect(readMonths()[MONTH_A].profileBudgets?.Mari).toBe(777));
  });

  it("6. editing a budget right after a rename keeps a single, correctly-keyed entry", async () => {
    await renderReadyHarness(makeState(["Minha casa", "Maria"], { [MONTH_A]: { Maria: 100 } }), [
      "Minha casa",
      "Mari",
    ]);
    fireEvent.click(screen.getByText("rename"));
    await waitFor(() => expect(readMonths()[MONTH_A].profileBudgets).toEqual({ Mari: 100 }));

    fireEvent.click(screen.getByText("edit-budget-after-rename"));
    await waitFor(() => expect(readMonths()[MONTH_A].profileBudgets).toEqual({ Mari: 999 }));
  });

  it("7. duplicate names (case-insensitive) are still collapsed to one, unaffected by the fix", async () => {
    await renderReadyHarness(makeState(["Minha casa", "Maria"], { [MONTH_A]: { Maria: 50 } }), [
      "Minha casa",
      "maria",
      "MARIA",
    ]);
    fireEvent.click(screen.getByText("rename"));
    await waitFor(() => {
      const people = JSON.parse(screen.getByTestId("people").textContent!);
      expect(people).toEqual(["Minha casa", "maria"]);
    });
  });

  it("8. a profile with no budget in a given month does not gain one artificially after rename", async () => {
    await renderReadyHarness(
      makeState(["Minha casa", "Maria", "Ana"], { [MONTH_A]: { Maria: 100 } }), // Ana has no entry
      ["Minha casa", "Maria", "Ana Paula"],
    );
    fireEvent.click(screen.getByText("rename"));
    await waitFor(() => {
      const budgets = readMonths()[MONTH_A].profileBudgets!;
      expect(budgets).toEqual({ Maria: 100 }); // no "Ana Paula" key added
    });
  });
});
