// @vitest-environment jsdom
// P0-IMPORT-1 follow-up: duplicating an expense must never copy
// bankTransactionId — a duplicate is a new, manually-created expense, not
// the same bank transaction, and the column is unique per household.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FinanceState } from "./types";

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

// Dynamic, not static: see the TDZ note in supabaseRepository.test.ts.
const { FinanceProvider, useFinance } = await import("./FinanceContext");

const MONTH = "2026-08";
const FAKE_USER = { id: "user-1", email: "teste@example.com" };
const FAKE_WORKSPACE = { householdId: "household-1", profiles: [], months: [] };

function stateWithExpense(
  overrides: Partial<FinanceState["months"][string]["expenses"][number]> = {},
): FinanceState {
  return {
    people: ["Maria", "Oziel"],
    activePerson: "me",
    activeMonth: MONTH,
    months: {
      [MONTH]: {
        label: "Agosto 2026",
        income: 5000,
        houseContribution: 1000,
        expenses: [
          {
            id: "exp-original",
            name: "Padaria",
            category: "Alimentação",
            amount: 8.5,
            status: "A pagar",
            owner: "Maria",
            date: `${MONTH}-05`,
            paymentMethod: "Pix",
            note: "",
            ...overrides,
          },
        ],
        priorities: [],
      },
    },
  };
}

function Harness() {
  const { ready, duplicateExpense, saveExpense, state } = useFinance();
  if (!ready) return <div>carregando</div>;
  const expenses = state.months[MONTH].expenses;
  return (
    <div>
      <pre data-testid="dump">{JSON.stringify(expenses)}</pre>
      <button data-testid="duplicate-btn" onClick={() => duplicateExpense("exp-original")}>
        duplicar
      </button>
      <button
        data-testid="edit-original-btn"
        onClick={() => {
          const original = expenses.find((e) => e.id === "exp-original");
          if (!original) return;
          saveExpense({ ...original, amount: 99.9 }, "exp-original");
        }}
      >
        editar original
      </button>
    </div>
  );
}

async function renderReadyHarness(initialState: FinanceState) {
  mockRepo.getAuthenticatedUser.mockResolvedValue(FAKE_USER);
  mockRepo.loadRemoteFinance.mockResolvedValue({
    user: { id: FAKE_USER.id, name: "Teste" },
    state: initialState,
    workspace: FAKE_WORKSPACE,
    envelopes: [{ id: "env-1", label: "Outros", limit: 0, categories: ["Outros"] }],
  });
  mockRepo.saveRemoteFinance.mockResolvedValue({ workspace: FAKE_WORKSPACE, state: initialState });
  render(
    <FinanceProvider>
      <Harness />
    </FinanceProvider>,
  );
  await screen.findByTestId("duplicate-btn");
}

function readExpenses(): FinanceState["months"][string]["expenses"] {
  return JSON.parse(screen.getByTestId("dump").textContent!);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("P0-IMPORT-1 follow-up — duplicateExpense never copies bankTransactionId", () => {
  it("1. a bank-imported expense (FITID-A): duplicating keeps FITID-A on the original and gives the copy none", async () => {
    await renderReadyHarness(stateWithExpense({ bankTransactionId: "FITID-A" }));

    fireEvent.click(screen.getByTestId("duplicate-btn"));
    await waitFor(() => expect(readExpenses()).toHaveLength(2));

    const [original, copy] = readExpenses();
    expect(original.id).toBe("exp-original");
    expect(original.bankTransactionId).toBe("FITID-A");
    expect(copy.id).not.toBe("exp-original");
    expect(copy.bankTransactionId).toBeUndefined();
  });

  it("2. the copy syncs with bank_transaction_id null — never resends the original's id, so it can't violate the unique index", async () => {
    await renderReadyHarness(stateWithExpense({ bankTransactionId: "FITID-A" }));
    fireEvent.click(screen.getByTestId("duplicate-btn"));
    await waitFor(() => expect(mockRepo.saveRemoteFinance).toHaveBeenCalled());

    const [, , nextStateArg] = mockRepo.saveRemoteFinance.mock.calls[0];
    const syncedExpenses = nextStateArg.months[MONTH].expenses;
    const copy = syncedExpenses.find((e: { id: string }) => e.id !== "exp-original");
    expect(copy.bankTransactionId).toBeUndefined();
  });

  it("3. duplicating a manual expense (no bankTransactionId) still works exactly as before", async () => {
    await renderReadyHarness(stateWithExpense()); // no bankTransactionId at all

    fireEvent.click(screen.getByTestId("duplicate-btn"));
    await waitFor(() => expect(readExpenses()).toHaveLength(2));

    const [original, copy] = readExpenses();
    expect(original.name).toBe("Padaria");
    expect(copy.name).toBe("Padaria (cópia)");
    expect(copy.amount).toBe(original.amount);
    expect(copy.status).toBe("A pagar");
    expect(copy.bankTransactionId).toBeUndefined();
  });

  it("4. editing the original after duplicating still preserves its own FITID-A", async () => {
    await renderReadyHarness(stateWithExpense({ bankTransactionId: "FITID-A" }));
    fireEvent.click(screen.getByTestId("duplicate-btn"));
    await waitFor(() => expect(readExpenses()).toHaveLength(2));

    fireEvent.click(screen.getByTestId("edit-original-btn"));
    await waitFor(() => {
      const original = readExpenses().find((e) => e.id === "exp-original")!;
      expect(original.amount).toBe(99.9);
    });

    const original = readExpenses().find((e) => e.id === "exp-original")!;
    expect(original.bankTransactionId).toBe("FITID-A");
  });
});
