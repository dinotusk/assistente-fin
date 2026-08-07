// @vitest-environment jsdom
// P0-IMPORT-1: coverage for the import flows the P0-06 audit found untested
// (backup/JSON merge, async persistence confirmation, unresolved-owner
// flagging) — see the audit for the bugs these guard against.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

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

const MONTH_A = "2026-08";
const MONTH_B = "2026-09";
const FAKE_USER = { id: "user-1", email: "teste@example.com" };
const FAKE_WORKSPACE = { householdId: "household-1", profiles: [], months: [] };

function baseState(): FinanceState {
  return {
    people: ["Maria", "Oziel"],
    activePerson: "me",
    activeMonth: MONTH_A,
    months: {
      [MONTH_A]: {
        label: "Agosto 2026",
        income: 5000,
        houseContribution: 1000,
        expenses: [
          {
            id: "existing-a",
            name: "Aluguel",
            category: "Casa",
            amount: 1200,
            status: "Pago",
            owner: "Maria",
            date: `${MONTH_A}-01`,
            paymentMethod: "Pix",
            note: "",
          },
        ],
        priorities: [],
      },
      [MONTH_B]: {
        label: "Setembro 2026",
        income: 5000,
        houseContribution: 1000,
        expenses: [
          {
            id: "existing-b",
            name: "Internet",
            category: "Casa",
            amount: 100,
            status: "Pago",
            owner: "Oziel",
            date: `${MONTH_B}-01`,
            paymentMethod: "Pix",
            note: "",
          },
        ],
        priorities: [],
      },
    },
  };
}

function Harness() {
  const { ready, importData, state } = useFinance();
  // `result` is React state, not a raw DOM mutation: `state` (from
  // FinanceContext) and `result` (set below) must both go through React's
  // own render pipeline so a `waitFor` on one can never observe a commit
  // "ahead of" the other. The previous version wrote directly to
  // `document.getElementById("result")`, bypassing React entirely — under
  // heavy parallel-worker CPU contention that let `waitFor` see the
  // hand-written DOM node update before React had actually flushed the
  // *separate* `state` update `persist()` triggered earlier, so `readState()`
  // could read a stale snapshot even though the manual signal said "resolved".
  const [result, setResult] = useState("");
  if (!ready) return <div>carregando</div>;
  return (
    <div>
      <pre data-testid="dump">{JSON.stringify(state)}</pre>
      <button
        data-testid="import-btn"
        onClick={() => {
          const file = (window as unknown as { __importFile: File }).__importFile;
          importData(file).then(
            (summary) => setResult(`resolved:${JSON.stringify(summary)}`),
            (error: unknown) =>
              setResult(`rejected:${error instanceof Error ? error.message : String(error)}`),
          );
        }}
      >
        importar
      </button>
      <div data-testid="result">{result}</div>
    </div>
  );
}

function setImportFile(content: string, name = "arquivo.json", type = "application/json") {
  (window as unknown as { __importFile: File }).__importFile = new File([content], name, {
    type,
  });
}

function setImportBinaryFile(buffer: ArrayBuffer, name: string, type: string) {
  (window as unknown as { __importFile: File }).__importFile = new File([buffer], name, { type });
}

async function renderReadyHarness(initialState: FinanceState = baseState()) {
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
  await screen.findByTestId("import-btn");
}

function readState(): FinanceState {
  return JSON.parse(screen.getByTestId("dump").textContent!) as FinanceState;
}

async function clickImportAndWait() {
  fireEvent.click(screen.getByTestId("import-btn"));
  await waitFor(() => expect(screen.getByTestId("result").textContent).not.toBe(""));
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("P0-IMPORT-1 Etapa 2 — backup/JSON import is additive, not a replace", () => {
  it("re-importing your own export preserves every month, not just the one round-tripped", async () => {
    // Exactly the export/import round trip the audit's Bug #1 broke: export
    // the current state, then import it right back.
    const exported: FinanceState = baseState();
    setImportFile(JSON.stringify(exported));
    await renderReadyHarness();
    await clickImportAndWait();

    expect(screen.getByTestId("result").textContent).toMatch(/^resolved:/);
    const state = readState();
    expect(Object.keys(state.months).sort()).toEqual([MONTH_A, MONTH_B]);
    expect(state.months[MONTH_A].expenses.some((e) => e.id === "existing-a")).toBe(true);
    expect(state.months[MONTH_B].expenses.some((e) => e.id === "existing-b")).toBe(true);
  });

  it("a backup containing only ONE month leaves the other month completely untouched", async () => {
    const partialBackup: FinanceState = {
      people: ["Maria", "Oziel"],
      activePerson: "me",
      activeMonth: MONTH_B,
      months: {
        [MONTH_B]: {
          label: "Setembro 2026",
          income: 1,
          houseContribution: 0,
          expenses: [
            {
              id: "from-backup",
              name: "Streaming",
              category: "Lazer",
              amount: 39.9,
              status: "Pago",
              owner: "Maria",
              date: `${MONTH_B}-05`,
              paymentMethod: "Pix",
              note: "",
            },
          ],
          priorities: [],
        },
      },
    };
    setImportFile(JSON.stringify(partialBackup));
    await renderReadyHarness();
    await clickImportAndWait();

    const state = readState();
    // MONTH_A must survive byte-for-byte — this is the audit's Bug #1.
    expect(state.months[MONTH_A].expenses).toEqual(baseState().months[MONTH_A].expenses);
    expect(state.months[MONTH_A].income).toBe(5000);
    // MONTH_B gained the new expense but kept the old one too (additive).
    // Imported expenses always get a fresh id (see normalizeImportedExpense),
    // so compare by name/id-of-the-preserved-row instead of the imported id.
    expect(state.months[MONTH_B].expenses.some((e) => e.id === "existing-b")).toBe(true);
    expect(state.months[MONTH_B].expenses.some((e) => e.name === "Streaming")).toBe(true);
    expect(state.months[MONTH_B].expenses).toHaveLength(2);
    // scalar settings of an already-existing month are never changed by import
    expect(state.months[MONTH_B].income).toBe(5000);
  });

  it("importing a backup for a month that doesn't exist yet creates it with the imported values", async () => {
    const newMonthKey = "2026-10";
    const backup: FinanceState = {
      people: ["Maria", "Oziel"],
      activePerson: "me",
      activeMonth: newMonthKey,
      months: {
        [newMonthKey]: {
          label: "Outubro 2026",
          income: 4000,
          houseContribution: 800,
          expenses: [],
          priorities: [],
        },
      },
    };
    setImportFile(JSON.stringify(backup));
    await renderReadyHarness();
    await clickImportAndWait();

    const state = readState();
    expect(state.months[newMonthKey]).toBeTruthy();
    expect(state.months[newMonthKey].income).toBe(4000);
    // still has the two months that existed before
    expect(state.months[MONTH_A]).toBeTruthy();
    expect(state.months[MONTH_B]).toBeTruthy();
  });

  it("reimporting the exact same backup twice does not duplicate expenses", async () => {
    const backup: FinanceState = baseState();
    setImportFile(JSON.stringify(backup));
    await renderReadyHarness();
    await clickImportAndWait();
    const countAfterFirst = readState().months[MONTH_A].expenses.length;

    setImportFile(JSON.stringify(backup));
    await clickImportAndWait();
    const countAfterSecond = readState().months[MONTH_A].expenses.length;

    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it("extra unknown top-level fields in the backup don't break the import", async () => {
    const backup = {
      ...baseState(),
      __future_field_from_a_newer_app_version: { whatever: true },
    };
    setImportFile(JSON.stringify(backup));
    await renderReadyHarness();
    await clickImportAndWait();
    expect(screen.getByTestId("result").textContent).toMatch(/^resolved:/);
  });

  it("an invalid (malformed) JSON file rejects and never touches existing state", async () => {
    setImportFile("{ not valid json");
    await renderReadyHarness();
    const before = screen.getByTestId("dump").textContent;
    await clickImportAndWait();
    expect(screen.getByTestId("result").textContent).toMatch(/^rejected:/);
    expect(screen.getByTestId("dump").textContent).toBe(before);
  });

  it("a JSON file with no recognizable data (neither backup nor row-list shape) rejects with a clear message", async () => {
    setImportFile(JSON.stringify({ hello: "world" }));
    await renderReadyHarness();
    await clickImportAndWait();
    expect(screen.getByTestId("result").textContent).toMatch(/^rejected:/);
    expect(screen.getByTestId("result").textContent).toMatch(/formato/i);
  });
});

describe("P0-IMPORT-1 Etapa 5 — unresolved owner is flagged, never silently reassigned", () => {
  it("an expense whose owner doesn't match any real profile is skipped and reported, not attributed to profile 0", async () => {
    const backup: FinanceState = {
      people: ["Maria", "Oziel"],
      activePerson: "me",
      activeMonth: MONTH_A,
      months: {
        [MONTH_A]: {
          label: "Agosto 2026",
          income: 1,
          houseContribution: 0,
          expenses: [
            {
              id: "unknown-owner",
              name: "Presente",
              category: "Outros",
              amount: 50,
              status: "Pago",
              owner: "João", // not a real profile in this household
              date: `${MONTH_A}-05`,
              paymentMethod: "Pix",
              note: "",
            },
          ],
          priorities: [],
        },
      },
    };
    setImportFile(JSON.stringify(backup));
    await renderReadyHarness();
    await clickImportAndWait();

    const resultText = screen.getByTestId("result").textContent!;
    expect(resultText).toMatch(/^resolved:/);
    const summary = JSON.parse(resultText.slice("resolved:".length));
    expect(summary.importedExpenses).toBe(0);
    expect(summary.skipped).toEqual([
      { reason: "unresolved_owner", ownerRaw: "João", description: "Presente" },
    ]);
    // and it must NOT have been silently attached to Maria (profile 0)
    const state = readState();
    expect(state.months[MONTH_A].expenses.some((e) => e.name === "Presente")).toBe(false);
  });

  it("a row-list JSON import with an unresolvable owner is flagged the same way", async () => {
    setImportFile(
      JSON.stringify({
        gastos: [{ descricao: "Combustível", valor: 200, responsavel: "Pedro" }],
      }),
    );
    await renderReadyHarness();
    await clickImportAndWait();
    const summary = JSON.parse(screen.getByTestId("result").textContent!.slice("resolved:".length));
    expect(summary.importedExpenses).toBe(0);
    expect(summary.skipped[0]).toMatchObject({ reason: "unresolved_owner", ownerRaw: "Pedro" });
  });

  it("a row-list JSON import WITH a real owner name imports normally", async () => {
    setImportFile(
      JSON.stringify({
        gastos: [{ descricao: "Combustível", valor: 200, responsavel: "Oziel" }],
      }),
    );
    await renderReadyHarness();
    await clickImportAndWait();
    const summary = JSON.parse(screen.getByTestId("result").textContent!.slice("resolved:".length));
    expect(summary.importedExpenses).toBe(1);
    expect(summary.skipped).toEqual([]);
    expect(
      readState().months[MONTH_A].expenses.some(
        (e) => e.name === "Combustível" && e.owner === "Oziel",
      ),
    ).toBe(true);
  });
});

describe("P0-IMPORT-1 Etapa 1 — success only after the remote write actually confirms", () => {
  it("importData does not resolve until saveRemoteFinance resolves", async () => {
    let resolveWrite: (() => void) | undefined;
    mockRepo.saveRemoteFinance.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveWrite = () => resolve({ workspace: FAKE_WORKSPACE, state: baseState() });
        }),
    );
    setImportFile(JSON.stringify(baseState()));
    await renderReadyHarness();
    fireEvent.click(screen.getByTestId("import-btn"));

    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByTestId("result").textContent).toBe(""); // still pending — write hasn't confirmed

    resolveWrite?.();
    await waitFor(() => expect(screen.getByTestId("result").textContent).toMatch(/^resolved:/));
  });

  it("a remote write failure makes importData reject — the caller never believes it succeeded", async () => {
    mockRepo.saveRemoteFinance.mockRejectedValueOnce(new Error("network down"));
    setImportFile(JSON.stringify(baseState()));
    await renderReadyHarness();
    await clickImportAndWait();

    expect(screen.getByTestId("result").textContent).toMatch(/^rejected:/);
  });

  it("a remote write failure during import does not fire the generic ambient toast (import surfaces its own error instead)", async () => {
    mockRepo.saveRemoteFinance.mockRejectedValueOnce(new Error("network down"));
    setImportFile(JSON.stringify(baseState()));
    await renderReadyHarness();
    await clickImportAndWait();

    expect(screen.getByTestId("result").textContent).toMatch(/^rejected:/);
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("an ordinary (non-import) save still shows the generic toast on failure — no regression", async () => {
    mockRepo.saveRemoteFinance.mockRejectedValueOnce(new Error("network down"));
    await renderReadyHarness();
    // Reach in through the same context the app uses for a normal edit.
    function NormalSaveHarness() {
      const { saveExpense, ready } = useFinance();
      if (!ready) return null;
      return (
        <button
          data-testid="normal-save"
          onClick={() =>
            saveExpense({
              id: "x1",
              name: "Teste",
              category: "Outros",
              amount: 10,
              status: "A pagar",
              owner: "Maria",
              date: `${MONTH_A}-05`,
              paymentMethod: "Pix",
              note: "",
            })
          }
        >
          salvar
        </button>
      );
    }
    render(
      <FinanceProvider>
        <NormalSaveHarness />
      </FinanceProvider>,
    );
    await waitFor(
      () => screen.getAllByTestId("normal-save")[1] ?? screen.getByTestId("normal-save"),
    );
    const buttons = screen.getAllByTestId("normal-save");
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
  });
});

describe("P0-IMPORT-1 Etapa 2 — the same merge protection applies to spreadsheet (XLS/XLSX) import", () => {
  function buildXlsx(rows: unknown[][], sheetName: string): ArrayBuffer {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  }

  it("importing a spreadsheet for one month leaves the other existing month untouched", async () => {
    const buffer = buildXlsx(
      [
        ["Item", "Valor", "Categoria", "Status", "Responsavel", "Data"],
        ["Supermercado", 350.5, "Alimentação", "Pago", "Maria", "05/09/2026"],
      ],
      "Setembro 2026",
    );
    setImportBinaryFile(
      buffer,
      "planilha.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    await renderReadyHarness();
    await clickImportAndWait();

    expect(screen.getByTestId("result").textContent).toMatch(/^resolved:/);
    const state = readState();
    // MONTH_A (not in the spreadsheet at all) survives untouched.
    expect(state.months[MONTH_A].expenses).toEqual(baseState().months[MONTH_A].expenses);
    expect(state.months[MONTH_A].income).toBe(5000);
  });

  it("a spreadsheet row with an unrecognized responsavel is flagged, not attributed to profile 0", async () => {
    const buffer = buildXlsx(
      [
        ["Item", "Valor", "Categoria", "Status", "Responsavel", "Data"],
        ["Presente", 50, "Outros", "Pago", "João", "05/08/2026"],
      ],
      "Agosto 2026",
    );
    setImportBinaryFile(
      buffer,
      "planilha.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    await renderReadyHarness();
    await clickImportAndWait();

    const resultText = screen.getByTestId("result").textContent!;
    expect(resultText).toMatch(/^resolved:/);
    const summary = JSON.parse(resultText.slice("resolved:".length));
    expect(summary.importedExpenses).toBe(0);
    expect(summary.skipped).toEqual([
      { reason: "unresolved_owner", ownerRaw: "João", description: "Presente" },
    ]);
  });
});
