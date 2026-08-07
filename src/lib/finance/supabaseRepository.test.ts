import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConcurrencyConflictError } from "./concurrency";

const mockSupabase = { from: vi.fn() };

vi.mock("../supabase/client", () => ({ supabase: mockSupabase }));

// Dynamic, not static: a static top-level import of supabaseRepository.ts would
// resolve its "../supabase/client" import before the mockSupabase declaration
// above finishes initializing (ES module imports evaluate before any other
// top-level statement), throwing a TDZ error inside the vi.mock factory.
const { diffById, updateVersionedRow, deleteVersionedRow } = await import("./supabaseRepository");

/** A chainable query double: every builder method returns itself; select() resolves it. */
function makeQuery(result: { data: unknown; error: unknown }) {
  const query = {
    update: vi.fn(() => query),
    delete: vi.fn(() => query),
    eq: vi.fn(() => query),
    select: vi.fn(() => Promise.resolve(result)),
  };
  return query;
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

  it("known version, stale (0 rows affected): throws ConcurrencyConflictError instead of silently overwriting", async () => {
    const query = makeQuery({ data: [], error: null });
    mockSupabase.from.mockReturnValue(query);

    await expect(updateVersionedRow("expenses", { id: "e1", amount: 50 }, 3)).rejects.toThrow(
      ConcurrencyConflictError,
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

  it("two writes racing on the same base version: the first wins, the second is rejected as a conflict", async () => {
    const winner = makeQuery({ data: [{ id: "e1" }], error: null });
    mockSupabase.from.mockReturnValueOnce(winner);
    await updateVersionedRow("expenses", { id: "e1", amount: 10 }, 1);

    // The DB row is now at version 2; a second device still holding version 1 loses.
    const loser = makeQuery({ data: [], error: null });
    mockSupabase.from.mockReturnValueOnce(loser);
    await expect(updateVersionedRow("expenses", { id: "e1", amount: 20 }, 1)).rejects.toThrow(
      ConcurrencyConflictError,
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

  it("known version, stale (0 rows affected): throws ConcurrencyConflictError", async () => {
    const query = makeQuery({ data: [], error: null });
    mockSupabase.from.mockReturnValue(query);

    await expect(deleteVersionedRow("priorities", "p1", 2)).rejects.toThrow(
      ConcurrencyConflictError,
    );
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
// that unconditionally). This is reasoned from the unchanged, live policy
// definitions rather than empirically re-tested here; doing that requires a
// real Supabase instance with two authenticated test users, which this
// offline unit-test run cannot exercise. See migration SQL check below for
// the automatable half of this guarantee (no policy touched by this change).
