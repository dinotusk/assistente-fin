import { beforeEach, describe, expect, it, vi } from "vitest";

import { WriteNotAppliedError } from "./concurrency";
import type { FinanceState } from "./types";

const mockSupabase = { from: vi.fn(), rpc: vi.fn() };

vi.mock("../supabase/client", () => ({ supabase: mockSupabase }));

// Dynamic, not static: see the TDZ note in supabaseRepository.test.ts.
const {
  budgetIdentity,
  insertBudgetRow,
  updateVersionedBudget,
  deleteVersionedBudget,
  syncBudgets,
} = await import("./supabaseRepository");

/**
 * A chainable query double: every builder method returns itself, and the
 * query is thenable at every step — so `await .insert(x)` (no further
 * chaining, as insertBudgetRow does) resolves just as correctly as
 * `await .update(x).eq(...).eq(...).select(...)`.
 */
function makeQuery(result: { data: unknown; error: unknown }) {
  const query = {
    insert: vi.fn((_row?: Record<string, unknown>) => query),
    update: vi.fn((_patch?: Record<string, unknown>) => query),
    delete: vi.fn(() => query),
    eq: vi.fn((_col?: string, _value?: unknown) => query),
    select: vi.fn((_columns?: string) => query),
    then: (resolve: (value: { data: unknown; error: unknown }) => void) => resolve(result),
  };
  return query;
}

const MONTH_A = "2026-08";
const MONTH_B = "2026-09";
const MONTH_ID_A = "month-a";
const MONTH_ID_B = "month-b";
const PROFILE_ID_1 = "profile-1";
const PROFILE_ID_2 = "profile-2";
const HOUSEHOLD = "household-1";

const PROFILE_IDS = new Map([
  ["Maria", PROFILE_ID_1],
  ["Oziel", PROFILE_ID_2],
]);
const MONTH_IDS = new Map([
  [MONTH_A, MONTH_ID_A],
  [MONTH_B, MONTH_ID_B],
]);

function makeBudgetRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    household_id: HOUSEHOLD,
    month_id: MONTH_ID_A,
    profile_id: PROFILE_ID_1,
    amount: 100,
    version: 1,
    ...overrides,
  };
}

function stateWithBudgets(budgetsByMonth: Record<string, Record<string, number>>): FinanceState {
  const monthKeys = Object.keys(budgetsByMonth);
  const months: FinanceState["months"] = {};
  for (const key of monthKeys) {
    months[key] = {
      label: key,
      income: 0,
      houseContribution: 0,
      profileBudgets: budgetsByMonth[key],
      expenses: [],
      priorities: [],
    };
  }
  return { people: ["Maria", "Oziel"], activePerson: "eu", activeMonth: monthKeys[0], months };
}

beforeEach(() => mockSupabase.from.mockReset());

describe("insertBudgetRow", () => {
  it("1. inserts without an app-supplied version — the row starts at the column's default 1", async () => {
    const query = makeQuery({ data: null, error: null });
    mockSupabase.from.mockReturnValue(query);

    await insertBudgetRow({
      household_id: HOUSEHOLD,
      month_id: MONTH_ID_A,
      profile_id: PROFILE_ID_1,
      amount: 500,
    });

    expect(query.insert).toHaveBeenCalledWith(
      expect.not.objectContaining({ version: expect.anything() }),
    );
    const insertedRow = query.insert.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertedRow?.version).toBeUndefined();
  });

  it("7. a concurrent insert (23505) becomes WriteNotAppliedError, never the raw SQL error", async () => {
    const query = makeQuery({
      data: null,
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "profile_budgets_pkey"',
      },
    });
    mockSupabase.from.mockReturnValue(query);

    await expect(
      insertBudgetRow({
        household_id: HOUSEHOLD,
        month_id: MONTH_ID_A,
        profile_id: PROFILE_ID_1,
        amount: 999,
      }),
    ).rejects.toThrow(WriteNotAppliedError);
  });

  it("15a. the WriteNotAppliedError from a 23505 never exposes the SQL message or constraint name", async () => {
    const query = makeQuery({
      data: null,
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "profile_budgets_pkey"',
      },
    });
    mockSupabase.from.mockReturnValue(query);

    try {
      await insertBudgetRow({
        household_id: HOUSEHOLD,
        month_id: MONTH_ID_A,
        profile_id: PROFILE_ID_1,
        amount: 999,
      });
      throw new Error("expected insertBudgetRow to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(WriteNotAppliedError);
      const message = (err as Error).message;
      expect(message).not.toMatch(/23505|constraint|duplicate key|SQLSTATE|pkey/i);
    }
  });

  it("propagates a non-23505 error unchanged (not swallowed into a false conflict)", async () => {
    const query = makeQuery({ data: null, error: { code: "42501", message: "permission denied" } });
    mockSupabase.from.mockReturnValue(query);

    await expect(
      insertBudgetRow({
        household_id: HOUSEHOLD,
        month_id: MONTH_ID_A,
        profile_id: PROFILE_ID_1,
        amount: 1,
      }),
    ).rejects.toThrow("permission denied");
  });
});

describe("updateVersionedBudget", () => {
  it("2. update with known version bumps it by exactly +1", async () => {
    const query = makeQuery({
      data: [{ month_id: MONTH_ID_A, profile_id: PROFILE_ID_1 }],
      error: null,
    });
    mockSupabase.from.mockReturnValue(query);

    await updateVersionedBudget(MONTH_ID_A, PROFILE_ID_1, 250, 1);

    expect(query.update).toHaveBeenCalledWith({ amount: 250, version: 2 });
    expect(query.eq).toHaveBeenCalledWith("month_id", MONTH_ID_A);
    expect(query.eq).toHaveBeenCalledWith("profile_id", PROFILE_ID_1);
    expect(query.eq).toHaveBeenCalledWith("version", 1);
  });

  it("4. stale version (0 rows affected) throws WriteNotAppliedError", async () => {
    const query = makeQuery({ data: [], error: null });
    mockSupabase.from.mockReturnValue(query);

    await expect(updateVersionedBudget(MONTH_ID_A, PROFILE_ID_1, 250, 1)).rejects.toThrow(
      WriteNotAppliedError,
    );
  });

  it("15b. the stale-update WriteNotAppliedError never mentions a table/constraint detail", async () => {
    const query = makeQuery({ data: [], error: null });
    mockSupabase.from.mockReturnValue(query);

    try {
      await updateVersionedBudget(MONTH_ID_A, PROFILE_ID_1, 250, 1);
      throw new Error("expected updateVersionedBudget to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(WriteNotAppliedError);
      expect((err as Error).message).not.toMatch(/SQLSTATE|pkey|constraint/i);
    }
  });
});

describe("deleteVersionedBudget", () => {
  it("5. delete with the current version succeeds", async () => {
    const query = makeQuery({
      data: [{ month_id: MONTH_ID_A, profile_id: PROFILE_ID_1 }],
      error: null,
    });
    mockSupabase.from.mockReturnValue(query);

    await deleteVersionedBudget(MONTH_ID_A, PROFILE_ID_1, 3);

    expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith("version", 3);
  });

  it("6. stale delete (0 rows affected) throws WriteNotAppliedError", async () => {
    const query = makeQuery({ data: [], error: null });
    mockSupabase.from.mockReturnValue(query);

    await expect(deleteVersionedBudget(MONTH_ID_A, PROFILE_ID_1, 3)).rejects.toThrow(
      WriteNotAppliedError,
    );
  });
});

describe("syncBudgets — incremental diff, no delete-all/insert-all", () => {
  it("8. an unchanged budget produces zero insert/update/delete calls — only the final re-select", async () => {
    const existing = [makeBudgetRow({ amount: 100, version: 5 })];
    const nextState = stateWithBudgets({ [MONTH_A]: { Maria: 100 } });

    const selectQuery = makeQuery({ data: existing, error: null });
    mockSupabase.from.mockReturnValue(selectQuery);

    await syncBudgets(HOUSEHOLD, nextState, PROFILE_IDS, MONTH_IDS, existing);

    expect(selectQuery.insert).not.toHaveBeenCalled();
    expect(selectQuery.update).not.toHaveBeenCalled();
    expect(selectQuery.delete).not.toHaveBeenCalled();
    expect(mockSupabase.from).toHaveBeenCalledTimes(1); // only the trailing re-select
  });

  it("9. editing month A's budget never touches month B's row", async () => {
    const existing = [
      makeBudgetRow({ month_id: MONTH_ID_A, profile_id: PROFILE_ID_1, amount: 100, version: 1 }),
      makeBudgetRow({ month_id: MONTH_ID_B, profile_id: PROFILE_ID_1, amount: 200, version: 1 }),
    ];
    const nextState = stateWithBudgets({
      [MONTH_A]: { Maria: 150 }, // changed
      [MONTH_B]: { Maria: 200 }, // unchanged
    });

    const updateQuery = makeQuery({
      data: [{ month_id: MONTH_ID_A, profile_id: PROFILE_ID_1 }],
      error: null,
    });
    const selectQuery = makeQuery({ data: existing, error: null });
    mockSupabase.from
      .mockReturnValueOnce(updateQuery) // the one write: month A's update
      .mockReturnValueOnce(selectQuery); // trailing re-select

    await syncBudgets(HOUSEHOLD, nextState, PROFILE_IDS, MONTH_IDS, existing);

    expect(updateQuery.eq).toHaveBeenCalledWith("month_id", MONTH_ID_A);
    expect(updateQuery.eq).not.toHaveBeenCalledWith("month_id", MONTH_ID_B);
  });

  it("10. editing profile 1's budget never touches profile 2's row", async () => {
    const existing = [
      makeBudgetRow({ profile_id: PROFILE_ID_1, amount: 100, version: 1 }),
      makeBudgetRow({ profile_id: PROFILE_ID_2, amount: 300, version: 1 }),
    ];
    const nextState = stateWithBudgets({
      [MONTH_A]: { Maria: 150, Oziel: 300 }, // only Maria (profile 1) changed
    });

    const updateQuery = makeQuery({
      data: [{ month_id: MONTH_ID_A, profile_id: PROFILE_ID_1 }],
      error: null,
    });
    const selectQuery = makeQuery({ data: existing, error: null });
    mockSupabase.from.mockReturnValueOnce(updateQuery).mockReturnValueOnce(selectQuery);

    await syncBudgets(HOUSEHOLD, nextState, PROFILE_IDS, MONTH_IDS, existing);

    expect(updateQuery.eq).toHaveBeenCalledWith("profile_id", PROFILE_ID_1);
    expect(updateQuery.eq).not.toHaveBeenCalledWith("profile_id", PROFILE_ID_2);
  });

  it("11. removing one budget does not delete the others", async () => {
    const existing = [
      makeBudgetRow({ profile_id: PROFILE_ID_1, amount: 100, version: 2 }),
      makeBudgetRow({ profile_id: PROFILE_ID_2, amount: 300, version: 1 }),
    ];
    const nextState = stateWithBudgets({ [MONTH_A]: { Oziel: 300 } }); // Maria's entry removed

    const deleteQuery = makeQuery({
      data: [{ month_id: MONTH_ID_A, profile_id: PROFILE_ID_1 }],
      error: null,
    });
    const selectQuery = makeQuery({ data: [existing[1]], error: null });
    mockSupabase.from.mockReturnValueOnce(deleteQuery).mockReturnValueOnce(selectQuery);

    await syncBudgets(HOUSEHOLD, nextState, PROFILE_IDS, MONTH_IDS, existing);

    expect(deleteQuery.delete).toHaveBeenCalledTimes(1);
    expect(deleteQuery.eq).toHaveBeenCalledWith("profile_id", PROFILE_ID_1);
    expect(deleteQuery.eq).not.toHaveBeenCalledWith("profile_id", PROFILE_ID_2);
  });

  it("12. the returned array is the freshly re-selected workspace.budgets, versions included", async () => {
    const existing = [makeBudgetRow({ amount: 100, version: 1 })];
    const nextState = stateWithBudgets({ [MONTH_A]: { Maria: 150 } });
    const reselected = [makeBudgetRow({ amount: 150, version: 2 })];

    const updateQuery = makeQuery({
      data: [{ month_id: MONTH_ID_A, profile_id: PROFILE_ID_1 }],
      error: null,
    });
    const selectQuery = makeQuery({ data: reselected, error: null });
    mockSupabase.from.mockReturnValueOnce(updateQuery).mockReturnValueOnce(selectQuery);

    const result = await syncBudgets(HOUSEHOLD, nextState, PROFILE_IDS, MONTH_IDS, existing);

    expect(result).toEqual(reselected);
  });

  it("3 & 13. a second edit in the same session uses the version the server just returned", async () => {
    const firstExisting = [makeBudgetRow({ amount: 100, version: 1 })];
    const firstNext = stateWithBudgets({ [MONTH_A]: { Maria: 150 } });
    const afterFirstSave = [makeBudgetRow({ amount: 150, version: 2 })];

    const firstUpdate = makeQuery({
      data: [{ month_id: MONTH_ID_A, profile_id: PROFILE_ID_1 }],
      error: null,
    });
    const firstSelect = makeQuery({ data: afterFirstSave, error: null });
    mockSupabase.from.mockReturnValueOnce(firstUpdate).mockReturnValueOnce(firstSelect);

    const resultAfterFirstSave = await syncBudgets(
      HOUSEHOLD,
      firstNext,
      PROFILE_IDS,
      MONTH_IDS,
      firstExisting,
    );
    expect(resultAfterFirstSave[0].version).toBe(2);

    // Second save: existingBudgets is exactly what the first save returned (workspace.budgets).
    const secondNext = stateWithBudgets({ [MONTH_A]: { Maria: 175 } });
    const secondUpdate = makeQuery({
      data: [{ month_id: MONTH_ID_A, profile_id: PROFILE_ID_1 }],
      error: null,
    });
    const secondSelect = makeQuery({
      data: [makeBudgetRow({ amount: 175, version: 3 })],
      error: null,
    });
    mockSupabase.from.mockReturnValueOnce(secondUpdate).mockReturnValueOnce(secondSelect);

    await syncBudgets(HOUSEHOLD, secondNext, PROFILE_IDS, MONTH_IDS, resultAfterFirstSave);

    expect(secondUpdate.update).toHaveBeenCalledWith({ amount: 175, version: 3 });
    expect(secondUpdate.eq).toHaveBeenCalledWith("version", 2); // not 1, not an unknown-version fallback
  });

  it("14. rename resolves to the same profile_id, so the sync still UPDATEs the existing row (not a stray insert)", async () => {
    // "Maria" was renamed to "Mari" locally before this save (savePeople already
    // rewrote profileBudgets' key) — profileIds now maps the *new* name to the
    // same profile_id the existing budget row already belongs to.
    const renamedProfileIds = new Map([["Mari", PROFILE_ID_1]]);
    const existing = [makeBudgetRow({ profile_id: PROFILE_ID_1, amount: 100, version: 1 })];
    const nextState = stateWithBudgets({ [MONTH_A]: { Mari: 100 } }); // same amount, just renamed

    const selectQuery = makeQuery({ data: existing, error: null });
    mockSupabase.from.mockReturnValue(selectQuery);

    await syncBudgets(HOUSEHOLD, nextState, renamedProfileIds, MONTH_IDS, existing);

    // Same amount under the resolved (renamed) key -> recognized as unchanged, not a new row.
    expect(selectQuery.insert).not.toHaveBeenCalled();
    expect(selectQuery.update).not.toHaveBeenCalled();
  });
});

describe("budgetIdentity", () => {
  it("builds a stable month:profile key", () => {
    expect(budgetIdentity(MONTH_ID_A, PROFILE_ID_1)).toBe(`${MONTH_ID_A}:${PROFILE_ID_1}`);
  });
});
