// Static checks on the P0-02A migration that adds the optimistic-concurrency
// `version` column to expenses, priorities and finance_months. These can
// only verify the SQL *text* — actual Postgres behavior (the constant
// default really applying to new rows, RLS really staying untouched) needs a
// live database and is verified separately once applied.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = resolve(__dirname, "../../../supabase/migrations");
const VERSION_SQL = readFileSync(
  resolve(MIGRATIONS_DIR, "20260806060000_expense_priority_month_version.sql"),
  "utf8",
);

describe("P0-02A version column migration (SQL text)", () => {
  it("adds an integer version column, not null, defaulting to 1, to expenses/priorities/finance_months", () => {
    for (const table of ["expenses", "priorities", "finance_months"]) {
      expect(VERSION_SQL).toMatch(
        new RegExp(
          `alter table public\\.${table}\\s+add column if not exists version integer not null default 1;`,
        ),
      );
    }
  });

  it("does not touch profile_budgets — that table's delete-all/reinsert-all sync is a separate, undone risk", () => {
    expect(VERSION_SQL).not.toMatch(/alter table public\.profile_budgets/i);
  });

  it("does not create, alter or drop any RLS policy — household scoping is unchanged", () => {
    expect(VERSION_SQL).not.toMatch(/\b(create|alter|drop)\s+policy\b/i);
  });

  it("does not touch grants/privileges — no REVOKE/GRANT statements", () => {
    expect(VERSION_SQL).not.toMatch(/\b(revoke|grant)\b/i);
  });

  it("does not delete or truncate any existing row", () => {
    expect(VERSION_SQL).not.toMatch(/\b(delete from|truncate)\b/i);
  });

  it("is wrapped in a single explicit transaction", () => {
    expect(VERSION_SQL).toMatch(/\bbegin;/i);
    expect(VERSION_SQL.trim()).toMatch(/commit;$/i);
  });
});
