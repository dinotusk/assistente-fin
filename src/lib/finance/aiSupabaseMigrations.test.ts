// Static checks on the pending, not-yet-applied migrations that fix the RPC
// privilege gap and move AI consent writes behind SECURITY DEFINER RPCs.
// These can only verify the SQL *text* — actual Postgres role enforcement
// (anon/authenticated genuinely denied EXECUTE, RLS genuinely blocking direct
// writes) needs a live database and is verified separately once applied.
// This is a regression guard against someone accidentally dropping a revoke
// or loosening a policy in a future edit to these files.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { AI_CONSENT_VERSION } from "./aiConsent";

const MIGRATIONS_DIR = resolve(__dirname, "../../../supabase/migrations");
const RATE_LIMIT_FIX_SQL = readFileSync(
  resolve(MIGRATIONS_DIR, "20260806030000_fix_rate_limit_rpc_privileges.sql"),
  "utf8",
);
const CONSENT_RPC_SQL = readFileSync(
  resolve(MIGRATIONS_DIR, "20260806040000_ai_consents_rpc_only.sql"),
  "utf8",
);
// P0-05B round 2.1: accept_ai_consent() was redefined (CREATE OR REPLACE, not
// an edit to the historical migration above) to hardcode version 2 instead of
// 1 — this is now the authoritative definition of what version get granted.
const CONSENT_VERSION_BUMP_SQL = readFileSync(
  resolve(MIGRATIONS_DIR, "20260810120000_ai_consent_version_2.sql"),
  "utf8",
);

describe("check_and_log_ai_rate_limit privilege fix (SQL text)", () => {
  it("uses an empty search_path", () => {
    expect(RATE_LIMIT_FIX_SQL).toMatch(/set search_path = ''/);
  });

  it("revokes execute from public, anon and authenticated", () => {
    expect(RATE_LIMIT_FIX_SQL).toMatch(
      /revoke all on function public\.check_and_log_ai_rate_limit\([^)]*\) from public;/,
    );
    expect(RATE_LIMIT_FIX_SQL).toMatch(
      /revoke all on function public\.check_and_log_ai_rate_limit\([^)]*\) from anon;/,
    );
    expect(RATE_LIMIT_FIX_SQL).toMatch(
      /revoke all on function public\.check_and_log_ai_rate_limit\([^)]*\) from authenticated;/,
    );
  });

  it("grants execute only to service_role", () => {
    expect(RATE_LIMIT_FIX_SQL).toMatch(
      /grant execute on function public\.check_and_log_ai_rate_limit\([^)]*\) to service_role;/,
    );
    expect(RATE_LIMIT_FIX_SQL).not.toMatch(/to (anon|authenticated|public);/);
  });
});

describe("ai_consents table privileges (SQL text)", () => {
  it("explicitly revokes all table privileges from public, anon and authenticated", () => {
    expect(CONSENT_RPC_SQL).toMatch(/revoke all on table public\.ai_consents from public;/);
    expect(CONSENT_RPC_SQL).toMatch(/revoke all on table public\.ai_consents from anon;/);
    expect(CONSENT_RPC_SQL).toMatch(/revoke all on table public\.ai_consents from authenticated;/);
  });

  it("grants authenticated SELECT only — no INSERT, UPDATE or DELETE grant anywhere for it", () => {
    expect(CONSENT_RPC_SQL).toMatch(/grant select on table public\.ai_consents to authenticated;/);
    expect(CONSENT_RPC_SQL).not.toMatch(/grant[^;]*insert[^;]*to authenticated/i);
    expect(CONSENT_RPC_SQL).not.toMatch(/grant[^;]*update[^;]*to authenticated/i);
    expect(CONSENT_RPC_SQL).not.toMatch(/grant[^;]*delete[^;]*to authenticated/i);
  });

  it("grants service_role the CRUD it needs, explicitly rather than relying on project defaults", () => {
    expect(CONSENT_RPC_SQL).toMatch(
      /grant select, insert, update, delete on table public\.ai_consents to service_role;/,
    );
  });

  it("has only a SELECT-your-own-row policy — no client-writable policy", () => {
    expect(CONSENT_RPC_SQL).toMatch(/for select to authenticated/i);
    expect(CONSENT_RPC_SQL).not.toMatch(/for (all|insert|update|delete) to authenticated/i);
  });

  it("stores no question, answer or financial context columns", () => {
    const createTableMatch = CONSENT_RPC_SQL.match(
      /create table public\.ai_consents \(([\s\S]*?)\);/,
    );
    expect(createTableMatch).not.toBeNull();
    const columns = createTableMatch![1];
    expect(columns).not.toMatch(/question|answer|resposta|pergunta|contexto|context/i);
  });
});

describe("accept_ai_consent / revoke_ai_consent RPCs (SQL text)", () => {
  it("take no parameters — no user_id, no consent_version", () => {
    expect(CONSENT_RPC_SQL).toMatch(/create or replace function public\.accept_ai_consent\(\)/);
    expect(CONSENT_RPC_SQL).toMatch(/create or replace function public\.revoke_ai_consent\(\)/);
  });

  it("derive the user from auth.uid(), not an argument", () => {
    const uidMatches = CONSENT_RPC_SQL.match(/auth\.uid\(\)/g) || [];
    expect(uidMatches.length).toBeGreaterThanOrEqual(2);
  });

  it("accept_ai_consent hardcodes the version rather than accepting one", () => {
    expect(CONSENT_RPC_SQL).toMatch(/v_current_version constant integer := \d+;/);
  });

  it("both RPCs use an empty search_path", () => {
    const searchPathMatches = CONSENT_RPC_SQL.match(/set search_path = ''/g) || [];
    expect(searchPathMatches.length).toBe(2);
  });

  it("revoke execute from every role including service_role, grant only to authenticated, for both RPCs", () => {
    for (const fn of ["accept_ai_consent", "revoke_ai_consent"]) {
      for (const role of ["public", "anon", "authenticated", "service_role"]) {
        expect(CONSENT_RPC_SQL).toMatch(
          new RegExp(`revoke all on function public\\.${fn}\\(\\) from ${role};`),
        );
      }
      expect(CONSENT_RPC_SQL).toMatch(
        new RegExp(`grant execute on function public\\.${fn}\\(\\) to authenticated;`),
      );
      // Nothing else is ever granted execute on these two functions.
      const grantMatches =
        CONSENT_RPC_SQL.match(
          new RegExp(`grant execute on function public\\.${fn}\\(\\)[^;]*;`, "g"),
        ) || [];
      expect(grantMatches).toHaveLength(1);
    }
  });
});

/** Strips `-- ...` line comments so a doc comment that merely discusses grants/
 *  revokes (in prose) can't be confused with the SQL actually executing one. */
function stripSqlComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

describe("accept_ai_consent version 2 bump — 20260810120000 (SQL text)", () => {
  it("redefines only accept_ai_consent — never edits the original migration's table/RLS/grants", () => {
    expect(CONSENT_VERSION_BUMP_SQL).toMatch(
      /create or replace function public\.accept_ai_consent\(\)/,
    );
    // No grant/revoke/alter table/policy statement anywhere in this file's
    // executable SQL (comments aside) — the function keeps the ACL it already
    // had from 20260806040000 (CREATE OR REPLACE preserves grants on the same
    // name+signature), so this migration has no business touching privileges
    // or RLS at all.
    const executable = stripSqlComments(CONSENT_VERSION_BUMP_SQL);
    expect(executable).not.toMatch(/\bgrant\b/i);
    expect(executable).not.toMatch(/\brevoke\b/i);
    expect(executable).not.toMatch(/\balter table\b/i);
    expect(executable).not.toMatch(/\bcreate policy\b/i);
    expect(executable).not.toMatch(/\bcreate table\b/i);
  });

  it("hardcodes version 2 — the SQL version matches AI_CONSENT_VERSION in code, fails on drift", () => {
    const match = CONSENT_VERSION_BUMP_SQL.match(/v_current_version constant integer := (\d+);/);
    expect(match).not.toBeNull();
    const sqlVersion = Number(match![1]);
    expect(sqlVersion).toBe(AI_CONSENT_VERSION);
    expect(sqlVersion).toBe(2);
  });

  it("still derives the user from auth.uid() and rejects unauthenticated calls", () => {
    expect(CONSENT_VERSION_BUMP_SQL).toMatch(/v_user_id uuid := auth\.uid\(\)/);
    expect(CONSENT_VERSION_BUMP_SQL).toMatch(/raise exception 'Not authenticated'/);
  });

  it("keeps the same security definer + empty search_path as the original definition", () => {
    expect(CONSENT_VERSION_BUMP_SQL).toMatch(/security definer/);
    expect(CONSENT_VERSION_BUMP_SQL).toMatch(/set search_path = ''/);
  });

  it("the original 20260806040000 migration is untouched — still hardcodes version 1 (history is never edited)", () => {
    expect(CONSENT_RPC_SQL).toMatch(/v_current_version constant integer := 1;/);
  });
});
