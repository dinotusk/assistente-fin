// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WriteNotAppliedError } from "./concurrency";
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

// Dynamic, not static: see the TDZ note in supabaseRepository.test.ts — the
// same applies here for both mocked modules above.
const { FinanceProvider, useFinance } = await import("./FinanceContext");

const MONTH = "2026-08";

function makeState(): FinanceState {
  return {
    people: ["Minha casa"],
    activePerson: "eu",
    activeMonth: MONTH,
    months: {
      [MONTH]: { label: "Agosto", income: 0, houseContribution: 0, expenses: [], priorities: [] },
    },
  };
}

const FAKE_USER = { id: "user-1", email: "teste@example.com" };
const FAKE_WORKSPACE = { householdId: "household-1", profiles: [], months: [] };

function Harness() {
  const { ready, writeConflict, refreshAfterConflict, dismissWriteConflict, saveExpense } =
    useFinance();
  if (!ready) return <div>carregando</div>;
  return (
    <div>
      <div data-testid="conflict">
        {writeConflict ? `conflict:${writeConflict.table}:${writeConflict.id}` : "none"}
      </div>
      <button
        onClick={() =>
          saveExpense({
            id: "exp-1",
            name: "Teste",
            category: "Outros",
            amount: 10,
            status: "A pagar",
            owner: "Minha casa",
            date: `${MONTH}-05`,
            paymentMethod: "Pix",
            note: "",
          })
        }
      >
        salvar
      </button>
      {/* Mirrors ConflictDialog's own handleRefresh: swallows the rejection
          locally, same as the real UI, instead of leaving an unhandled
          promise rejection here. */}
      <button onClick={() => void refreshAfterConflict().catch(() => undefined)}>refresh</button>
      <button onClick={dismissWriteConflict}>dismiss</button>
    </div>
  );
}

async function renderReadyHarness() {
  render(
    <FinanceProvider>
      <Harness />
    </FinanceProvider>,
  );
  await screen.findByText("salvar");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRepo.getAuthenticatedUser.mockResolvedValue(FAKE_USER);
  mockRepo.loadRemoteFinance.mockResolvedValue({
    user: { id: FAKE_USER.id, name: "Teste" },
    state: makeState(),
    workspace: FAKE_WORKSPACE,
    envelopes: [{ id: "env-1", label: "Outros", limit: 0, categories: ["Outros"] }],
  });
  mockRepo.saveRemoteFinance.mockResolvedValue({ workspace: FAKE_WORKSPACE, state: makeState() });
});

afterEach(() => cleanup());

describe("FinanceContext — write-conflict handling", () => {
  it("1. WriteNotAppliedError opens the conflict state (no toast)", async () => {
    mockRepo.saveRemoteFinance.mockRejectedValueOnce(new WriteNotAppliedError("expenses", "exp-1"));
    await renderReadyHarness();

    fireEvent.click(screen.getByText("salvar"));

    await waitFor(() =>
      expect(screen.getByTestId("conflict").textContent).toBe("conflict:expenses:exp-1"),
    );
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("2. a plain error keeps using the normal toast, not the conflict dialog", async () => {
    mockRepo.saveRemoteFinance.mockRejectedValueOnce(new Error("network down"));
    await renderReadyHarness();

    fireEvent.click(screen.getByText("salvar"));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("conflict").textContent).toBe("none");
  });

  it("3. clicking Atualizar dados reloads remote state", async () => {
    mockRepo.saveRemoteFinance.mockRejectedValueOnce(new WriteNotAppliedError("expenses", "exp-1"));
    await renderReadyHarness();
    fireEvent.click(screen.getByText("salvar"));
    await waitFor(() =>
      expect(screen.getByTestId("conflict").textContent).toBe("conflict:expenses:exp-1"),
    );
    expect(mockRepo.loadRemoteFinance).toHaveBeenCalledTimes(1); // just the initial mount

    await act(async () => {
      fireEvent.click(screen.getByText("refresh"));
      await Promise.resolve();
    });

    await waitFor(() => expect(mockRepo.loadRemoteFinance).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("conflict").textContent).toBe("none");
  });

  it("4. clicking Fechar clears the conflict without reloading or breaking state", async () => {
    mockRepo.saveRemoteFinance.mockRejectedValueOnce(new WriteNotAppliedError("expenses", "exp-1"));
    await renderReadyHarness();
    fireEvent.click(screen.getByText("salvar"));
    await waitFor(() =>
      expect(screen.getByTestId("conflict").textContent).toBe("conflict:expenses:exp-1"),
    );

    fireEvent.click(screen.getByText("dismiss"));

    expect(screen.getByTestId("conflict").textContent).toBe("none");
    expect(mockRepo.loadRemoteFinance).toHaveBeenCalledTimes(1); // unchanged — no reload happened

    // State isn't broken: a subsequent save still works normally.
    fireEvent.click(screen.getByText("salvar"));
    await waitFor(() => expect(mockRepo.saveRemoteFinance).toHaveBeenCalledTimes(2));
  });

  it("5. a conflict does not trigger any automatic retry (no loop)", async () => {
    mockRepo.saveRemoteFinance.mockRejectedValueOnce(new WriteNotAppliedError("expenses", "exp-1"));
    await renderReadyHarness();
    fireEvent.click(screen.getByText("salvar"));
    await waitFor(() =>
      expect(screen.getByTestId("conflict").textContent).toBe("conflict:expenses:exp-1"),
    );

    // Give any accidental retry loop a chance to fire before asserting.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(mockRepo.saveRemoteFinance).toHaveBeenCalledTimes(1);
  });

  it("6. two conflicts in a row both work correctly", async () => {
    mockRepo.saveRemoteFinance.mockRejectedValueOnce(new WriteNotAppliedError("expenses", "exp-1"));
    await renderReadyHarness();
    fireEvent.click(screen.getByText("salvar"));
    await waitFor(() =>
      expect(screen.getByTestId("conflict").textContent).toBe("conflict:expenses:exp-1"),
    );
    fireEvent.click(screen.getByText("dismiss"));
    expect(screen.getByTestId("conflict").textContent).toBe("none");

    mockRepo.saveRemoteFinance.mockRejectedValueOnce(
      new WriteNotAppliedError("priorities", "pri-9"),
    );
    fireEvent.click(screen.getByText("salvar"));
    await waitFor(() =>
      expect(screen.getByTestId("conflict").textContent).toBe("conflict:priorities:pri-9"),
    );
  });

  it("7. no conflict means no unnecessary reload — a successful save never calls loadRemoteFinance again", async () => {
    await renderReadyHarness();
    expect(mockRepo.loadRemoteFinance).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("salvar"));
    await waitFor(() => expect(mockRepo.saveRemoteFinance).toHaveBeenCalledTimes(1));

    expect(mockRepo.loadRemoteFinance).toHaveBeenCalledTimes(1); // still just the initial mount
    expect(screen.getByTestId("conflict").textContent).toBe("none");
  });

  it("8. a failed refresh keeps the conflict open, doesn't crash, and the UI can still recover", async () => {
    mockRepo.saveRemoteFinance.mockRejectedValueOnce(new WriteNotAppliedError("expenses", "exp-1"));
    await renderReadyHarness();
    fireEvent.click(screen.getByText("salvar"));
    await waitFor(() =>
      expect(screen.getByTestId("conflict").textContent).toBe("conflict:expenses:exp-1"),
    );

    mockRepo.loadRemoteFinance.mockRejectedValueOnce(new Error("network down"));
    await act(async () => {
      fireEvent.click(screen.getByText("refresh"));
      await Promise.resolve();
    });
    await waitFor(() => expect(mockRepo.loadRemoteFinance).toHaveBeenCalledTimes(2));

    // The failed refresh must not silently clear the conflict, and the tree
    // must still be intact (still rendering, not stuck/blank).
    expect(screen.getByTestId("conflict").textContent).toBe("conflict:expenses:exp-1");
    expect(screen.getByText("salvar")).toBeTruthy();

    // Recovery still works: dismiss, and a fresh retry, both work normally.
    fireEvent.click(screen.getByText("dismiss"));
    expect(screen.getByTestId("conflict").textContent).toBe("none");
    fireEvent.click(screen.getByText("salvar"));
    await waitFor(() => expect(mockRepo.saveRemoteFinance).toHaveBeenCalledTimes(2));
  });

  it("9. a second save can be queued before the first one's network round trip resolves — persist() never blocks the UI (see the multi-write-in-flight risk documented above refreshAfterConflict)", async () => {
    let resolveFirstSave: (() => void) | undefined;
    mockRepo.saveRemoteFinance.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstSave = () => resolve({ workspace: FAKE_WORKSPACE, state: makeState() });
        }),
    );
    await renderReadyHarness();

    fireEvent.click(screen.getByText("salvar")); // first save starts, hangs mid-flight
    await act(async () => {
      await Promise.resolve(); // flush the microtask so the first write actually starts
    });
    expect(mockRepo.saveRemoteFinance).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("salvar")); // second save queued while the first is unresolved
    await act(async () => {
      await Promise.resolve(); // give the second a chance to (incorrectly) start too
    });

    // Only the first write has actually started executing (proves execution
    // is serialized) even though a second was already accepted/queued
    // (proves queuing itself is never blocked or rejected).
    expect(mockRepo.saveRemoteFinance).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirstSave?.();
      await Promise.resolve();
    });
    await waitFor(() => expect(mockRepo.saveRemoteFinance).toHaveBeenCalledTimes(2));
  });
});
