import { beforeEach, describe, expect, it, vi } from "vitest";

import { isDuplicate } from "./bankImport";
import { WriteNotAppliedError } from "./concurrency";
import type { Expense, FinanceState } from "./types";

const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
  auth: { getUser: vi.fn(), updateUser: vi.fn() },
};

vi.mock("../supabase/client", () => ({ supabase: mockSupabase }));

// Dynamic, not static: a static top-level import of supabaseRepository.ts would
// resolve its "../supabase/client" import before the mockSupabase declaration
// above finishes initializing (ES module imports evaluate before any other
// top-level statement), throwing a TDZ error inside the vi.mock factory.
const {
  diffById,
  updateVersionedRow,
  deleteVersionedRow,
  syncExpenses,
  syncPriorities,
  applyConfirmedVersions,
  loadRemoteFinance,
  updatePassword,
  getLinkedProviders,
  listHouseholdMembers,
} = await import("./supabaseRepository");

/** A chainable query double: every builder method returns itself; select() resolves it. */
function makeQuery(result: { data: unknown; error: unknown }) {
  const query = {
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    delete: vi.fn(() => query),
    eq: vi.fn(() => query),
    select: vi.fn(() => Promise.resolve(result)),
  };
  return query;
}

function emptyState(monthKey: string, expenses: Expense[] = []): FinanceState {
  return {
    people: ["Minha casa"],
    activePerson: "eu",
    activeMonth: monthKey,
    months: {
      [monthKey]: { label: "Agosto", income: 0, houseContribution: 0, expenses, priorities: [] },
    },
  };
}

describe("diffById — created vs. updated vs. deleted classification", () => {
  it("classifies an id absent from previous as created, not updated", () => {
    const result = diffById([], [{ id: "a" }]);
    expect(result.created).toEqual([{ id: "a" }]);
    expect(result.updated).toEqual([]);
    expect(result.deletedIds).toEqual([]);
  });

  it("classifies a changed existing id as updated, not created", () => {
    const before = [{ id: "a", amount: 1 }];
    const after = [{ id: "a", amount: 2 }];
    const result = diffById(before, after);
    expect(result.created).toEqual([]);
    expect(result.updated).toEqual([{ id: "a", amount: 2 }]);
  });

  it("excludes an unchanged existing id from both created and updated", () => {
    const row = { id: "a", amount: 1 };
    const result = diffById([row], [{ ...row }]);
    expect(result.created).toEqual([]);
    expect(result.updated).toEqual([]);
  });

  it("lists ids present in previous but absent from next as deleted", () => {
    const result = diffById([{ id: "a" }, { id: "b" }], [{ id: "a" }]);
    expect(result.deletedIds).toEqual(["b"]);
  });
});

describe("updateVersionedRow — optimistic concurrency on UPDATE", () => {
  beforeEach(() => mockSupabase.from.mockReset());

  it("known version, still current: succeeds and bumps version by exactly +1", async () => {
    const query = makeQuery({ data: [{ id: "e1" }], error: null });
    mockSupabase.from.mockReturnValue(query);

    await updateVersionedRow("expenses", { id: "e1", amount: 50 }, 3);

    expect(mockSupabase.from).toHaveBeenCalledWith("expenses");
    expect(query.update).toHaveBeenCalledWith({ amount: 50, version: 4 });
    expect(query.eq).toHaveBeenCalledWith("id", "e1");
    expect(query.eq).toHaveBeenCalledWith("version", 3);
  });

  it("known version, stale (0 rows affected): throws WriteNotAppliedError instead of silently overwriting", async () => {
    const query = makeQuery({ data: [], error: null });
    mockSupabase.from.mockReturnValue(query);

    await expect(updateVersionedRow("expenses", { id: "e1", amount: 50 }, 3)).rejects.toThrow(
      WriteNotAppliedError,
    );
  });

  it("the error message never claims a specific cause (another device, deletion, or RLS) — zero rows is genuinely ambiguous", async () => {
    const query = makeQuery({ data: [], error: null });
    mockSupabase.from.mockReturnValue(query);

    await expect(updateVersionedRow("expenses", { id: "e1", amount: 50 }, 3)).rejects.toThrow(
      /alterado, removido, ou nao esta mais acessivel/,
    );
    // Regression guard: this used to falsely assert "outro dispositivo alterou este registro",
    // which isn't true when the real cause is RLS hiding the row or a deletion.
    await expect(updateVersionedRow("expenses", { id: "e1", amount: 50 }, 3)).rejects.not.toThrow(
      /outro dispositivo/,
    );
  });

  it("unknown version: falls back to an unconditional update by id (pre-version compatible), never throws", async () => {
    const query = makeQuery({ data: [], error: null });
    mockSupabase.from.mockReturnValue(query);

    await updateVersionedRow("expenses", { id: "e1", amount: 50 }, undefined);

    expect(query.update).toHaveBeenCalledWith({ amount: 50 });
    expect(query.eq).toHaveBeenCalledTimes(1);
    expect(query.eq).toHaveBeenCalledWith("id", "e1");
  });

  it("two writes racing on the same base version: the first wins, the second gets WriteNotAppliedError", async () => {
    const winner = makeQuery({ data: [{ id: "e1" }], error: null });
    mockSupabase.from.mockReturnValueOnce(winner);
    await updateVersionedRow("expenses", { id: "e1", amount: 10 }, 1);

    // The DB row is now at version 2; a second device still holding version 1 loses.
    const loser = makeQuery({ data: [], error: null });
    mockSupabase.from.mockReturnValueOnce(loser);
    await expect(updateVersionedRow("expenses", { id: "e1", amount: 20 }, 1)).rejects.toThrow(
      WriteNotAppliedError,
    );
  });

  it("surfaces a DB error instead of swallowing it", async () => {
    const query = makeQuery({ data: null, error: new Error("boom") });
    mockSupabase.from.mockReturnValue(query);
    await expect(updateVersionedRow("expenses", { id: "e1" }, 1)).rejects.toThrow("boom");
  });
});

describe("deleteVersionedRow — optimistic concurrency on DELETE", () => {
  beforeEach(() => mockSupabase.from.mockReset());

  it("known version, still current: succeeds", async () => {
    const query = makeQuery({ data: [{ id: "p1" }], error: null });
    mockSupabase.from.mockReturnValue(query);

    await deleteVersionedRow("priorities", "p1", 2);

    expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith("id", "p1");
    expect(query.eq).toHaveBeenCalledWith("version", 2);
  });

  it("known version, stale (0 rows affected): throws WriteNotAppliedError", async () => {
    const query = makeQuery({ data: [], error: null });
    mockSupabase.from.mockReturnValue(query);

    await expect(deleteVersionedRow("priorities", "p1", 2)).rejects.toThrow(WriteNotAppliedError);
  });

  it("unknown version: deletes unconditionally by id, matching pre-version behavior", async () => {
    const query = makeQuery({ data: [], error: null });
    mockSupabase.from.mockReturnValue(query);

    await deleteVersionedRow("priorities", "p1", undefined);

    expect(query.eq).toHaveBeenCalledTimes(1);
    expect(query.eq).toHaveBeenCalledWith("id", "p1");
  });
});

// Household/RLS scoping for expenses, priorities and finance_months is not
// changed by P0-02A — the version column is just one more equality check in
// the same WHERE clause, evaluated after RLS's own is_household_member(...)
// predicate. A user on household A can no longer overwrite household B's row
// by guessing an id + version than they could before (RLS already forbade
// that unconditionally).
//
// This was confirmed empirically against a real Supabase project with two
// disposable test users/households: a cross-household UPDATE/DELETE with the
// *correct* version still affected zero rows, identical in shape to a
// stale-version conflict (no error, empty result). That confirmed finding is
// exactly why the thrown error is WriteNotAppliedError, not something that
// claims "another device changed this" — this offline suite can't reproduce
// two real authenticated sessions, so it only asserts the error stays
// neutral (see updateVersionedRow/deleteVersionedRow tests above); it does
// not re-derive the RLS finding itself.

const MONTH = "2026-08";
const PROFILE_IDS = new Map([["Minha casa", "profile-1"]]);
const MONTH_IDS = new Map([[MONTH, "month-1"]]);

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Aluguel",
    category: "Moradia",
    amount: 100,
    status: "A pagar",
    owner: "Minha casa",
    date: "2026-08-05",
    paymentMethod: "Pix",
    note: "",
    ...overrides,
  };
}

describe("version propagation — a save's confirmed state carries server-assigned versions forward", () => {
  beforeEach(() => {
    mockSupabase.from.mockReset();
  });

  it("first update (version=1) receives version=2 back, and applyConfirmedVersions puts it on the state that becomes the new base", async () => {
    const expense = makeExpense({ version: 1 });
    const previousState = emptyState(MONTH, [expense]);
    const nextState = emptyState(MONTH, [{ ...expense, amount: 150 }]);

    const updateQuery = makeQuery({ data: [{ id: expense.id, version: 2 }], error: null });
    mockSupabase.from.mockReturnValueOnce(updateQuery);

    const expenseVersions = await syncExpenses(
      "household-1",
      previousState,
      nextState,
      PROFILE_IDS,
      MONTH_IDS,
    );

    expect(expenseVersions.get(expense.id)).toBe(2);
    expect(updateQuery.eq).toHaveBeenCalledWith("version", 1);
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({ version: 2 }));

    const confirmed = applyConfirmedVersions(nextState, expenseVersions, new Map());
    expect(confirmed.months[MONTH].expenses[0].version).toBe(2);
    // Untouched top-level fields keep object identity — this is a targeted patch, not a reload.
    expect(confirmed.months[MONTH].label).toBe(previousState.months[MONTH].label);
  });

  it("a second edit in the same session, built on the confirmed v2 state, sends version=2 and receives version=3 — never falls back", async () => {
    const expense = makeExpense({ version: 2 });
    const confirmedAfterFirstSave = emptyState(MONTH, [expense]);
    const secondEdit = emptyState(MONTH, [{ ...expense, amount: 200 }]);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const updateQuery = makeQuery({ data: [{ id: expense.id, version: 3 }], error: null });
    mockSupabase.from.mockReturnValueOnce(updateQuery);

    const versions = await syncExpenses(
      "household-1",
      confirmedAfterFirstSave,
      secondEdit,
      PROFILE_IDS,
      MONTH_IDS,
    );

    expect(versions.get(expense.id)).toBe(3);
    expect(updateQuery.eq).toHaveBeenCalledWith("version", 2);
    expect(warnSpy).not.toHaveBeenCalled(); // never dropped into the unknown-version fallback
    warnSpy.mockRestore();
  });

  it("a device still holding the pre-update version (stale base) is rejected, not silently overwritten", async () => {
    const staleExpense = makeExpense({ version: 1 }); // the real DB row is already at version 2
    const previousStateDeviceB = emptyState(MONTH, [staleExpense]);
    const nextStateDeviceB = emptyState(MONTH, [{ ...staleExpense, amount: 999 }]);

    const conflictQuery = makeQuery({ data: [], error: null }); // id+version=1 matches 0 rows
    mockSupabase.from.mockReturnValueOnce(conflictQuery);

    await expect(
      syncExpenses("household-1", previousStateDeviceB, nextStateDeviceB, PROFILE_IDS, MONTH_IDS),
    ).rejects.toThrow(WriteNotAppliedError);
  });

  it("an inserted row's version (1) is known immediately, so the very next edit in the same session already carries it", async () => {
    const created = makeExpense({ id: "22222222-2222-4222-8222-222222222222" });
    const previousStateEmpty = emptyState(MONTH, []);
    const nextStateCreate = emptyState(MONTH, [created]);

    const insertQuery = makeQuery({ data: [{ id: created.id, version: 1 }], error: null });
    mockSupabase.from.mockReturnValueOnce(insertQuery);

    const createVersions = await syncExpenses(
      "household-1",
      previousStateEmpty,
      nextStateCreate,
      PROFILE_IDS,
      MONTH_IDS,
    );
    expect(createVersions.get(created.id)).toBe(1);
    expect(insertQuery.insert).toHaveBeenCalled();

    const confirmedAfterCreate = applyConfirmedVersions(nextStateCreate, createVersions, new Map());
    const editedNext = emptyState(MONTH, [
      { ...confirmedAfterCreate.months[MONTH].expenses[0], amount: 85 },
    ]);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const updateQuery = makeQuery({ data: [{ id: created.id, version: 2 }], error: null });
    mockSupabase.from.mockReturnValueOnce(updateQuery);

    await syncExpenses("household-1", confirmedAfterCreate, editedNext, PROFILE_IDS, MONTH_IDS);
    expect(updateQuery.eq).toHaveBeenCalledWith("version", 1); // not the fallback path
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("deleting a row at its current known version succeeds; deleting one whose version is already stale is rejected", async () => {
    const expense = makeExpense({ version: 5 });
    const previousState = emptyState(MONTH, [expense]);
    const nextStateDeleted = emptyState(MONTH, []);

    const deleteQuery = makeQuery({ data: [{ id: expense.id }], error: null });
    mockSupabase.from.mockReturnValueOnce(deleteQuery);
    await syncExpenses("household-1", previousState, nextStateDeleted, PROFILE_IDS, MONTH_IDS);
    expect(deleteQuery.eq).toHaveBeenCalledWith("version", 5);

    const staleDeleteQuery = makeQuery({ data: [], error: null });
    mockSupabase.from.mockReturnValueOnce(staleDeleteQuery);
    await expect(
      syncExpenses("household-1", previousState, nextStateDeleted, PROFILE_IDS, MONTH_IDS),
    ).rejects.toThrow(WriteNotAppliedError);
  });

  it("applyConfirmedVersions is a no-op passthrough when nothing was written (no insert/update calls)", () => {
    const state = emptyState(MONTH, [makeExpense({ version: 1 })]);
    expect(applyConfirmedVersions(state, new Map(), new Map())).toBe(state);
  });

  it("syncPriorities propagates versions the same way as syncExpenses", async () => {
    const previousState: FinanceState = {
      ...emptyState(MONTH),
      months: {
        [MONTH]: {
          label: "Agosto",
          income: 0,
          houseContribution: 0,
          expenses: [],
          priorities: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              name: "Viagem",
              amount: 5000,
              rank: 1,
              status: "A pagar",
              responsavel: "Minha casa",
              version: 1,
            },
          ],
        },
      },
    };
    const nextState: FinanceState = {
      ...previousState,
      months: {
        [MONTH]: {
          ...previousState.months[MONTH],
          priorities: [{ ...previousState.months[MONTH].priorities[0], amount: 6000 }],
        },
      },
    };

    const updateQuery = makeQuery({
      data: [{ id: previousState.months[MONTH].priorities[0].id, version: 2 }],
      error: null,
    });
    mockSupabase.from.mockReturnValueOnce(updateQuery);

    const priorityVersions = await syncPriorities(
      "household-1",
      previousState,
      nextState,
      PROFILE_IDS,
      MONTH_IDS,
    );
    expect(priorityVersions.get(previousState.months[MONTH].priorities[0].id)).toBe(2);
    expect(updateQuery.eq).toHaveBeenCalledWith("version", 1);
  });
});

describe("loadRemoteFinance — the DB's version column is read back onto Expense/Priority", () => {
  beforeEach(() => {
    mockSupabase.from.mockReset();
    mockSupabase.rpc.mockReset();
  });

  it("a freshly loaded expense carries version=1 straight from the initial select, no extra round trip needed", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: "household-1", error: null });

    const tableRows: Record<string, unknown> = {
      app_users: { display_name: "Junior" },
      household_members: { household_id: "household-1" },
      financial_profiles: [
        {
          id: "profile-1",
          household_id: "household-1",
          name: "Minha casa",
          kind: "household",
          sort_order: 0,
          active: true,
        },
      ],
      finance_months: [
        {
          id: "month-1",
          household_id: "household-1",
          period: "2026-08-01",
          label: "Agosto",
          income: 0,
          house_contribution: 0,
          planned: false,
          version: 1,
        },
      ],
      profile_budgets: [],
      expenses: [
        {
          id: "expense-1",
          month_id: "month-1",
          owner_profile_id: "profile-1",
          paid_by_profile_id: "profile-1",
          description: "Aluguel",
          entry_type: "expense",
          category: "Moradia",
          amount: 100,
          status: "A pagar",
          expense_date: "2026-08-05",
          due_date: "2026-08-05",
          competence: "2026-08-01",
          payment_method: "Pix",
          note: "",
          recurring: false,
          recurring_key: null,
          installment_key: null,
          installment_number: null,
          installment_total: null,
          created_at: "2026-08-01T00:00:00Z",
          version: 1,
        },
      ],
      priorities: [],
      envelopes: [],
    };

    mockSupabase.from.mockImplementation((table: string) => {
      const data = tableRows[table];
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        maybeSingle: vi.fn(() => Promise.resolve({ data, error: null })),
        then: (resolve: (value: { data: unknown; error: null }) => void) =>
          resolve({ data, error: null }),
      };
      return query;
    });

    const user = { id: "user-1", email: "junior@example.com", user_metadata: {} } as Parameters<
      typeof loadRemoteFinance
    >[0];
    const loaded = await loadRemoteFinance(user);

    expect(loaded.state.months["2026-08"].expenses[0].version).toBe(1);
  });
});

describe("P0-IMPORT-1 — bank_transaction_id load/insert/update", () => {
  beforeEach(() => {
    mockSupabase.from.mockReset();
    mockSupabase.rpc.mockReset();
  });

  function baseExpenseRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "expense-1",
      month_id: "month-1",
      owner_profile_id: "profile-1",
      paid_by_profile_id: "profile-1",
      description: "Padaria",
      entry_type: "expense",
      category: "Alimentação",
      amount: 8.5,
      status: "A pagar",
      expense_date: "2026-08-05",
      due_date: "2026-08-05",
      competence: "2026-08-01",
      payment_method: "Pix",
      note: "",
      recurring: false,
      recurring_key: null,
      installment_key: null,
      installment_number: null,
      installment_total: null,
      created_at: "2026-08-01T00:00:00Z",
      version: 1,
      bank_transaction_id: null,
      ...overrides,
    };
  }

  function mockLoadRemoteFinanceWith(expenseRow: Record<string, unknown>) {
    mockSupabase.rpc.mockResolvedValue({ data: "household-1", error: null });
    const tableRows: Record<string, unknown> = {
      app_users: { display_name: "Junior" },
      household_members: { household_id: "household-1" },
      financial_profiles: [
        {
          id: "profile-1",
          household_id: "household-1",
          name: "Minha casa",
          kind: "household",
          sort_order: 0,
          active: true,
        },
      ],
      finance_months: [
        {
          id: "month-1",
          household_id: "household-1",
          period: "2026-08-01",
          label: "Agosto",
          income: 0,
          house_contribution: 0,
          planned: false,
          version: 1,
        },
      ],
      profile_budgets: [],
      expenses: [expenseRow],
      priorities: [],
      envelopes: [],
    };
    mockSupabase.from.mockImplementation((table: string) => {
      const data = tableRows[table];
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        maybeSingle: vi.fn(() => Promise.resolve({ data, error: null })),
        then: (resolve: (value: { data: unknown; error: null }) => void) =>
          resolve({ data, error: null }),
      };
      return query;
    });
  }

  async function loadExpense0() {
    const user = { id: "user-1", email: "junior@example.com", user_metadata: {} } as Parameters<
      typeof loadRemoteFinance
    >[0];
    const loaded = await loadRemoteFinance(user);
    return loaded.state.months["2026-08"].expenses[0];
  }

  it("1/6. loadRemoteFinance hydrates bank_transaction_id as Expense.bankTransactionId", async () => {
    mockLoadRemoteFinanceWith(baseExpenseRow({ bank_transaction_id: "FITID-A" }));
    const expense = await loadExpense0();
    expect(expense.bankTransactionId).toBe("FITID-A");
  });

  it("2. a null bank_transaction_id (manual expense) loads fine, with no invented fallback", async () => {
    mockLoadRemoteFinanceWith(baseExpenseRow({ bank_transaction_id: null }));
    const expense = await loadExpense0();
    expect(expense.bankTransactionId).toBeUndefined();
  });

  it("3. inserting a bank-imported expense sends bank_transaction_id to Supabase", async () => {
    const expense = makeExpense({ bankTransactionId: "FITID-B" });
    const insertQuery = makeQuery({ data: [{ id: expense.id, version: 1 }], error: null });
    mockSupabase.from.mockReturnValueOnce(insertQuery);

    await syncExpenses(
      "household-1",
      emptyState(MONTH, []),
      emptyState(MONTH, [expense]),
      PROFILE_IDS,
      MONTH_IDS,
    );

    expect(insertQuery.insert).toHaveBeenCalledWith([
      expect.objectContaining({ bank_transaction_id: "FITID-B" }),
    ]);
  });

  it("4. inserting a manual expense (no bankTransactionId) never invents one — sends null", async () => {
    const expense = makeExpense(); // no bankTransactionId
    const insertQuery = makeQuery({ data: [{ id: expense.id, version: 1 }], error: null });
    mockSupabase.from.mockReturnValueOnce(insertQuery);

    await syncExpenses(
      "household-1",
      emptyState(MONTH, []),
      emptyState(MONTH, [expense]),
      PROFILE_IDS,
      MONTH_IDS,
    );

    expect(insertQuery.insert).toHaveBeenCalledWith([
      expect.objectContaining({ bank_transaction_id: null }),
    ]);
  });

  it("5. editing name/amount/date/owner/category/status of an imported expense re-sends the SAME bankTransactionId, never drops it", async () => {
    const original = makeExpense({ version: 3, bankTransactionId: "FITID-C" });
    const edited = { ...original, amount: 42, category: "Outros", status: "Pago" as const };
    const updateQuery = makeQuery({ data: [{ id: original.id, version: 4 }], error: null });
    mockSupabase.from.mockReturnValueOnce(updateQuery);

    await syncExpenses(
      "household-1",
      emptyState(MONTH, [original]),
      emptyState(MONTH, [edited]),
      PROFILE_IDS,
      MONTH_IDS,
    );

    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ bank_transaction_id: "FITID-C", amount: 42, status: "Pago" }),
    );
  });

  it("7/8. after a (simulated) reload, two transactions with different fitIds sharing date/amount/description stay distinct, and the same fitId is still deduped", async () => {
    // "existing" built exactly the way BankImportDialog builds it in production —
    // now correctly carrying bankTransactionId because loadRemoteFinance hydrates it.
    mockLoadRemoteFinanceWith(baseExpenseRow({ bank_transaction_id: "FITID-A" }));
    const reloadedExpense = await loadExpense0();
    const existingAfterReload = [
      {
        date: reloadedExpense.date,
        amount: reloadedExpense.amount,
        name: reloadedExpense.name,
        fitId: reloadedExpense.bankTransactionId,
      },
    ];

    const genuinelyDifferent = {
      date: reloadedExpense.date,
      amount: reloadedExpense.amount,
      type: "expense" as const,
      description: reloadedExpense.name,
      fitId: "FITID-B",
    };
    const sameTransactionAgain = {
      date: reloadedExpense.date,
      amount: reloadedExpense.amount,
      type: "expense" as const,
      description: reloadedExpense.name,
      fitId: "FITID-A",
    };

    expect(isDuplicate(genuinelyDifferent, existingAfterReload)).toBe(false); // must survive
    expect(isDuplicate(sameTransactionAgain, existingAfterReload)).toBe(true); // must dedupe
  });

  it("9. reimporting the same statement after reload does not duplicate (fingerprint still catches it even for entries without a hydrated fitId)", async () => {
    mockLoadRemoteFinanceWith(baseExpenseRow({ bank_transaction_id: "FITID-A" }));
    const reloadedExpense = await loadExpense0();
    const existingAfterReload = [
      {
        date: reloadedExpense.date,
        amount: reloadedExpense.amount,
        name: reloadedExpense.name,
        fitId: reloadedExpense.bankTransactionId,
      },
    ];
    const reimportedSameFile = {
      date: reloadedExpense.date,
      amount: reloadedExpense.amount,
      type: "expense" as const,
      description: reloadedExpense.name,
      fitId: "FITID-A",
    };
    expect(isDuplicate(reimportedSameFile, existingAfterReload)).toBe(true);
  });

  it("10. a bank_transaction_id unique-constraint violation on insert surfaces as a neutral WriteNotAppliedError, never the raw Postgres message", async () => {
    const expense = makeExpense({ bankTransactionId: "FITID-DUP" });
    const insertQuery = makeQuery({
      data: null,
      error: {
        message:
          'duplicate key value violates unique constraint "expenses_household_bank_transaction_id_key"',
        code: "23505",
      },
    });
    mockSupabase.from.mockReturnValueOnce(insertQuery);

    const rejection = syncExpenses(
      "household-1",
      emptyState(MONTH, []),
      emptyState(MONTH, [expense]),
      PROFILE_IDS,
      MONTH_IDS,
    );
    await expect(rejection).rejects.toThrow(WriteNotAppliedError);
    await expect(rejection).rejects.not.toThrow(/constraint|duplicate key|postgres/i);
  });
});

describe("P0-FRONTEND-1C.1 — ActiveUser.email, password change, providers, membership", () => {
  beforeEach(() => {
    mockSupabase.from.mockReset();
    mockSupabase.rpc.mockReset();
    mockSupabase.auth.getUser.mockReset();
    mockSupabase.auth.updateUser.mockReset();
  });

  function mockWorkspaceTables() {
    mockSupabase.rpc.mockResolvedValue({ data: "household-1", error: null });
    const tableRows: Record<string, unknown> = {
      app_users: { display_name: "Junior" },
      household_members: { household_id: "household-1" },
      financial_profiles: [
        {
          id: "profile-1",
          household_id: "household-1",
          name: "Minha casa",
          kind: "household",
          sort_order: 0,
          active: true,
        },
      ],
      finance_months: [
        {
          id: "month-1",
          household_id: "household-1",
          period: "2026-08-01",
          label: "Agosto",
          income: 0,
          house_contribution: 0,
          planned: false,
          version: 1,
        },
      ],
      profile_budgets: [],
      expenses: [],
      priorities: [],
      envelopes: [],
    };
    mockSupabase.from.mockImplementation((table: string) => {
      const data = tableRows[table];
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        maybeSingle: vi.fn(() => Promise.resolve({ data, error: null })),
        then: (resolve: (value: { data: unknown; error: null }) => void) =>
          resolve({ data, error: null }),
      };
      return query;
    });
  }

  it("loadRemoteFinance carries the real auth email into ActiveUser", async () => {
    mockWorkspaceTables();
    const user = { id: "user-1", email: "junior@example.com", user_metadata: {} } as Parameters<
      typeof loadRemoteFinance
    >[0];
    const loaded = await loadRemoteFinance(user);
    expect(loaded.user.email).toBe("junior@example.com");
  });

  it("loadRemoteFinance never throws when the auth user has no email — falls back to null, not a crash", async () => {
    mockWorkspaceTables();
    const user = {
      id: "user-1",
      email: undefined,
      user_metadata: {},
    } as unknown as Parameters<typeof loadRemoteFinance>[0];
    const loaded = await loadRemoteFinance(user);
    expect(loaded.user.email).toBeNull();
  });

  it("updatePassword calls supabase.auth.updateUser with only the new password", async () => {
    mockSupabase.auth.updateUser.mockResolvedValue({ data: {}, error: null });
    await updatePassword("nova-senha-123");
    expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({ password: "nova-senha-123" });
  });

  it("updatePassword surfaces a Supabase error instead of swallowing it", async () => {
    mockSupabase.auth.updateUser.mockResolvedValue({
      data: null,
      error: { message: "Password too weak" },
    });
    await expect(updatePassword("123")).rejects.toThrow("Password too weak");
  });

  it("getLinkedProviders reads the caller's own identities, never anyone else's", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", identities: [{ provider: "email" }, { provider: "google" }] } },
      error: null,
    });
    await expect(getLinkedProviders()).resolves.toEqual(["email", "google"]);
  });

  it("getLinkedProviders returns an empty list rather than throwing when there are no identities", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", identities: undefined } },
      error: null,
    });
    await expect(getLinkedProviders()).resolves.toEqual([]);
  });

  it("listHouseholdMembers marks only the caller's own row as isSelf, and never fetches names/emails of others", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const membersQuery = {
      select: vi.fn(() => membersQuery),
      eq: vi.fn(() => membersQuery),
      order: vi.fn(() =>
        Promise.resolve({
          data: [
            { user_id: "user-1", role: "owner", created_at: "2026-07-26T00:00:00Z" },
            { user_id: "user-2", role: "member", created_at: "2026-08-01T00:00:00Z" },
          ],
          error: null,
        }),
      ),
    };
    const householdQuery = {
      select: vi.fn(() => householdQuery),
      limit: vi.fn(() => householdQuery),
      maybeSingle: vi.fn(() =>
        Promise.resolve({ data: { household_id: "household-1" }, error: null }),
      ),
    };
    let call = 0;
    mockSupabase.from.mockImplementation(() => (call++ === 0 ? householdQuery : membersQuery));

    const members = await listHouseholdMembers();
    expect(members).toEqual([
      { userId: "user-1", role: "owner", joinedAt: "2026-07-26T00:00:00Z", isSelf: true },
      { userId: "user-2", role: "member", joinedAt: "2026-08-01T00:00:00Z", isSelf: false },
    ]);
    // No column requested here ever names/emails — select() is called with exactly this string.
    expect(membersQuery.select).toHaveBeenCalledWith("user_id, role, created_at");
  });
});
