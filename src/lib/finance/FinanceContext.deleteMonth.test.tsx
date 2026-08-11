// @vitest-environment jsdom
// P0-FRONTEND-1B.1 Etapa 5/6 — deleteMonth against the real FinanceContext
// (not a mock of it): deleting a month must only ever touch that month's own
// data, must never remove the only remaining month, and activeMonth must
// deterministically move to the chronologically previous available month
// (falling back to the next one only when there's no earlier month left).
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

const { FinanceProvider, useFinance } = await import("./FinanceContext");

const FAKE_USER = { id: "user-1", email: "teste@example.com" };
const FAKE_WORKSPACE = { householdId: "household-1", profiles: [], months: [] };

function makeMonth(label: string): MonthData {
  return {
    label,
    income: 1000,
    houseContribution: 0,
    expenses: [
      {
        id: `exp-${label}`,
        name: `Gasto ${label}`,
        category: "Outros",
        amount: 10,
        status: "A pagar",
        owner: "Maria",
        date: "2026-01-05",
        paymentMethod: "Pix",
        note: "",
      },
    ],
    priorities: [],
  };
}

function makeState(monthKeys: string[], activeMonth: string): FinanceState {
  const months: Record<string, MonthData> = {};
  monthKeys.forEach((key) => {
    months[key] = makeMonth(key);
  });
  return { people: ["Maria"], activePerson: "eu", activeMonth, months };
}

function Harness() {
  const { ready, state, deleteMonth } = useFinance();
  if (!ready) return <div>carregando</div>;
  return (
    <div>
      <pre data-testid="months">{JSON.stringify(Object.keys(state.months).sort())}</pre>
      <pre data-testid="active">{state.activeMonth}</pre>
      {Object.keys(state.months)
        .sort()
        .map((key) => (
          <button key={key} data-testid={`delete-${key}`} onClick={() => deleteMonth(key)}>
            excluir {key}
          </button>
        ))}
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
  await screen.findByTestId("months");
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("deleteMonth — real FinanceContext behavior", () => {
  it("deleting a non-active month removes only that month; other months and activeMonth are untouched", async () => {
    await renderReadyHarness(makeState(["2026-06", "2026-07", "2026-08"], "2026-08"));

    fireEvent.click(screen.getByTestId("delete-2026-06"));
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId("months").textContent!)).toEqual(["2026-07", "2026-08"]),
    );
    expect(screen.getByTestId("active").textContent).toBe("2026-08");
  });

  it("deleting the active month switches activeMonth to the chronologically previous remaining month", async () => {
    await renderReadyHarness(makeState(["2026-06", "2026-07", "2026-08"], "2026-08"));

    fireEvent.click(screen.getByTestId("delete-2026-08"));
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId("months").textContent!)).toEqual(["2026-06", "2026-07"]),
    );
    expect(screen.getByTestId("active").textContent).toBe("2026-07");
  });

  it("deleting the earliest (active) month with no previous available falls back to the next remaining month", async () => {
    await renderReadyHarness(makeState(["2026-06", "2026-07", "2026-08"], "2026-06"));

    fireEvent.click(screen.getByTestId("delete-2026-06"));
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId("months").textContent!)).toEqual(["2026-07", "2026-08"]),
    );
    expect(screen.getByTestId("active").textContent).toBe("2026-07");
  });

  it("deleting the only remaining month is a no-op — at least one month always survives", async () => {
    await renderReadyHarness(makeState(["2026-08"], "2026-08"));

    fireEvent.click(screen.getByTestId("delete-2026-08"));
    // Give any accidental async update a chance to land before asserting nothing changed.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.parse(screen.getByTestId("months").textContent!)).toEqual(["2026-08"]);
    expect(screen.getByTestId("active").textContent).toBe("2026-08");
  });

  it("the deleted month's own expenses never reappear in a surviving month", async () => {
    await renderReadyHarness(makeState(["2026-06", "2026-07"], "2026-07"));

    fireEvent.click(screen.getByTestId("delete-2026-06"));
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId("months").textContent!)).toEqual(["2026-07"]),
    );
    // The sync payload sent to the server no longer includes the deleted
    // month at all — proves the deletion is real, not just a local render
    // artifact that a refresh would resurrect.
    const lastCall = mockRepo.saveRemoteFinance.mock.calls.at(-1)!;
    const syncedState = lastCall[2] as FinanceState;
    expect(Object.keys(syncedState.months)).not.toContain("2026-06");
  });
});
