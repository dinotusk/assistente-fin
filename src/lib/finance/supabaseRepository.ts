import type { User } from "@supabase/supabase-js";

import { AI_CONSENT_VERSION } from "./aiConsent";
import { formatMonthLabel } from "./calc";
import { VIEW_ME } from "./constants";
import { WriteNotAppliedError } from "./concurrency";
import type { ActiveUser, EnvelopeRule, Expense, FinanceState, MonthData, Priority } from "./types";
import { supabase } from "../supabase/client";

interface ProfileRow {
  id: string;
  household_id: string;
  name: string;
  kind: string;
  sort_order: number;
  active: boolean;
}

interface MonthRow {
  id: string;
  household_id: string;
  period: string;
  label: string;
  income: number | string;
  house_contribution: number | string;
  planned: boolean;
  version: number;
}

interface BudgetRow {
  household_id: string;
  month_id: string;
  profile_id: string;
  amount: number | string;
  version: number;
}

interface ExpenseRow {
  id: string;
  month_id: string;
  owner_profile_id: string;
  paid_by_profile_id: string | null;
  description: string;
  entry_type: "expense" | "income";
  category: string;
  amount: number | string;
  status: Expense["status"];
  expense_date: string;
  due_date: string | null;
  competence: string;
  payment_method: string;
  note: string;
  recurring: boolean;
  recurring_key: string | null;
  installment_key: string | null;
  installment_number: number | null;
  installment_total: number | null;
  created_at: string;
  version: number;
}

interface PriorityRow {
  id: string;
  month_id: string;
  profile_id: string;
  description: string;
  target_amount: number | string;
  saved_amount: number | string;
  priority: number;
  status: Priority["status"];
  created_at: string;
  version: number;
}

interface EnvelopeRow {
  id: string;
  name: string;
  monthly_limit: number | string;
  categories: string[];
}

export interface FinanceWorkspace {
  householdId: string;
  profiles: ProfileRow[];
  months: MonthRow[];
  /** Internal-only, like MonthRow — never exposed via MonthData.profileBudgets. */
  budgets: BudgetRow[];
}

export interface LoadedFinance {
  user: ActiveUser;
  state: FinanceState;
  workspace: FinanceWorkspace;
  envelopes: EnvelopeRule[];
}

export interface AuthInput {
  name: string;
  email: string;
  password: string;
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function numberValue(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthKey(period: string): string {
  return period.slice(0, 7);
}

function periodFromKey(key: string): string {
  return `${key}-01`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validId(value: string): string {
  return isUuid(value) ? value : crypto.randomUUID();
}

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export async function registerWithSupabase(input: AuthInput, inviteCode?: string): Promise<void> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { display_name: input.name },
      emailRedirectTo:
        typeof window === "undefined"
          ? "https://assistente-fin.lovable.app"
          : window.location.origin,
    },
  });
  throwIfError(error);

  if (!data.user) throw new Error("Não foi possível criar o usuário.");
  if (!data.session) {
    throw new Error("Cadastro criado. Confirme o e-mail e depois entre no aplicativo.");
  }

  // Redeeming an invite joins the inviter's household instead of bootstrapping a new one.
  if (inviteCode?.trim()) {
    await redeemInvite(inviteCode, input.name);
  } else {
    await bootstrapWorkspace(input.name);
  }
}

export async function loginWithSupabase(input: AuthInput): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  throwIfError(error);
  await bootstrapWorkspace(input.name);
}

export async function logoutFromSupabase(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  throwIfError(error);
}

export async function getAuthenticatedUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  // Supabase returns AuthSessionMissingError for the normal "not logged in" case — not a real failure.
  if (error && error.name !== "AuthSessionMissingError") throwIfError(error);
  return data.user;
}

async function bootstrapWorkspace(displayName: string): Promise<string> {
  const { data, error } = await supabase.rpc("bootstrap_household", {
    user_display_name: displayName.trim(),
    new_household_name: "Minha casa",
  });
  throwIfError(error);
  return String(data);
}

/** Redeems an invite code for the currently authenticated user, moving them into that household. */
export async function redeemInvite(code: string, displayName: string): Promise<string> {
  const { data, error } = await supabase.rpc("redeem_household_invite", {
    p_code: code.trim(),
    p_display_name: displayName.trim(),
  });
  throwIfError(error);
  return String(data);
}

/** Generates (or reuses) an active invite code for the caller's own household. Admin/owner only. */
export async function createHouseholdInvite(): Promise<string> {
  const { data, error } = await supabase.rpc("create_household_invite");
  throwIfError(error);
  return String(data);
}

export interface PushSubscriptionKeys {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function savePushSubscription(subscription: PushSubscriptionKeys): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  throwIfError(userError);
  const userId = userData.user?.id;
  if (!userId) throw new Error("Sessao nao encontrada.");
  const householdId = await findHouseholdId();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      household_id: householdId,
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: "endpoint" },
  );
  throwIfError(error);
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  throwIfError(error);
}

export async function hasPushSubscription(endpoint: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("endpoint", endpoint)
    .maybeSingle();
  throwIfError(error);
  return Boolean(data);
}

export interface AiConsentStatus {
  granted: boolean;
  acceptedAt: string | null;
}

/**
 * The source of truth for AI consent — /api/gemini-chat checks the same table
 * server-side. Both writes go through SECURITY DEFINER RPCs that take no
 * arguments at all: accept_ai_consent() always stamps the database's own
 * current version and revoke_ai_consent() always scopes to auth.uid()
 * internally, so there is no client-writable path for either a user id or a
 * consent_version value — direct INSERT/UPDATE/DELETE on ai_consents is
 * denied by RLS (no such policy exists).
 */
export async function saveAiConsent(): Promise<void> {
  const { error } = await supabase.rpc("accept_ai_consent");
  throwIfError(error);
}

export async function revokeAiConsent(): Promise<void> {
  const { error } = await supabase.rpc("revoke_ai_consent");
  throwIfError(error);
}

/** Read-only; RLS restricts this to the caller's own row, so no explicit filter is needed. */
export async function getAiConsentStatus(): Promise<AiConsentStatus> {
  const { data, error } = await supabase
    .from("ai_consents")
    .select("consent_version, accepted_at, revoked_at")
    .maybeSingle();
  throwIfError(error);
  if (!data || !data.accepted_at || data.revoked_at || data.consent_version < AI_CONSENT_VERSION) {
    return { granted: false, acceptedAt: null };
  }
  return { granted: true, acceptedAt: data.accepted_at };
}

export async function loginWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo:
        typeof window === "undefined"
          ? "https://assistente-fin.lovable.app/entrar"
          : `${window.location.origin}/entrar`,
    },
  });
  throwIfError(error);
}

export async function loadRemoteFinance(user: User): Promise<LoadedFinance> {
  const metadataName = String(
    user.user_metadata?.display_name ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email ||
      "Usuario",
  );
  await bootstrapWorkspace(metadataName);

  const { data: appUser, error: userError } = await supabase
    .from("app_users")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  throwIfError(userError);

  const displayName = String(appUser?.display_name || metadataName);
  const householdId = await findHouseholdId();

  const [
    profilesResult,
    monthsResult,
    budgetsResult,
    expensesResult,
    prioritiesResult,
    envelopesResult,
  ] = await Promise.all([
    supabase
      .from("financial_profiles")
      .select("id, household_id, name, kind, sort_order, active")
      .eq("household_id", householdId)
      .order("sort_order"),
    supabase
      .from("finance_months")
      .select("id, household_id, period, label, income, house_contribution, planned, version")
      .eq("household_id", householdId)
      .order("period"),
    supabase
      .from("profile_budgets")
      .select("household_id, month_id, profile_id, amount, version")
      .eq("household_id", householdId),
    supabase
      .from("expenses")
      .select(
        "id, month_id, owner_profile_id, paid_by_profile_id, description, entry_type, category, amount, status, expense_date, due_date, competence, payment_method, note, recurring, recurring_key, installment_key, installment_number, installment_total, created_at, version",
      )
      .eq("household_id", householdId)
      .order("expense_date"),
    supabase
      .from("priorities")
      .select(
        "id, month_id, profile_id, description, target_amount, saved_amount, priority, status, created_at, version",
      )
      .eq("household_id", householdId)
      .order("priority"),
    supabase
      .from("envelopes")
      .select("id, name, monthly_limit, categories")
      .eq("household_id", householdId)
      .order("created_at"),
  ]);

  throwIfError(profilesResult.error);
  throwIfError(monthsResult.error);
  throwIfError(budgetsResult.error);
  throwIfError(expensesResult.error);
  throwIfError(prioritiesResult.error);
  throwIfError(envelopesResult.error);

  const profiles = (profilesResult.data || []) as ProfileRow[];
  const activeProfiles = profiles.filter((profile) => profile.active);
  let months = (monthsResult.data || []) as MonthRow[];
  if (!months.length) {
    months = [await createEmptyMonth(householdId, currentMonthKey())];
  }

  const budgets = (budgetsResult.data || []) as BudgetRow[];
  const expenses = (expensesResult.data || []) as ExpenseRow[];
  const priorities = (prioritiesResult.data || []) as PriorityRow[];
  const envelopes = ((envelopesResult.data || []) as EnvelopeRow[]).map((envelope) => ({
    id: envelope.id,
    label: envelope.name,
    limit: numberValue(envelope.monthly_limit),
    categories: envelope.categories?.length ? envelope.categories : ["Outros"],
  }));
  const profileNames = new Map(profiles.map((profile) => [profile.id, profile.name]));

  const stateMonths = Object.fromEntries(
    months.map((remoteMonth) => {
      const key = monthKey(remoteMonth.period);
      const monthExpenses: Expense[] = expenses
        .filter((expense) => expense.month_id === remoteMonth.id)
        .map((expense) => ({
          id: expense.id,
          name: expense.description,
          category: expense.category,
          amount: numberValue(expense.amount),
          status: expense.status,
          type: expense.entry_type || "expense",
          owner:
            profileNames.get(expense.owner_profile_id) || activeProfiles[0]?.name || "Minha casa",
          date: expense.expense_date,
          dueDate: expense.due_date || expense.expense_date,
          competence: monthKey(expense.competence || expense.expense_date),
          paidBy:
            profileNames.get(expense.paid_by_profile_id || "") ||
            profileNames.get(expense.owner_profile_id) ||
            activeProfiles[0]?.name ||
            "Minha casa",
          paymentMethod: expense.payment_method,
          note: expense.note,
          recurring: Boolean(expense.recurring),
          recurringKey: expense.recurring_key || undefined,
          installmentKey: expense.installment_key || undefined,
          installmentNumber: expense.installment_number || undefined,
          installmentTotal: expense.installment_total || undefined,
          createdAt: expense.created_at,
          version: expense.version,
        }));
      const monthPriorities: Priority[] = priorities
        .filter((priority) => priority.month_id === remoteMonth.id)
        .map((priority) => ({
          id: priority.id,
          name: priority.description,
          amount: numberValue(priority.target_amount),
          saved: numberValue(priority.saved_amount),
          rank: priority.priority,
          status: priority.status,
          responsavel:
            profileNames.get(priority.profile_id) || activeProfiles[0]?.name || "Minha casa",
          createdAt: priority.created_at,
          version: priority.version,
        }));
      const profileBudgets = Object.fromEntries(
        budgets
          .filter((budget) => budget.month_id === remoteMonth.id)
          .map((budget) => [profileNames.get(budget.profile_id), numberValue(budget.amount)])
          .filter(([name]) => Boolean(name)),
      );

      return [
        key,
        {
          label: remoteMonth.label,
          income: numberValue(remoteMonth.income),
          houseContribution: numberValue(remoteMonth.house_contribution),
          profileBudgets,
          planned: remoteMonth.planned,
          expenses: monthExpenses,
          priorities: monthPriorities,
        } satisfies MonthData,
      ];
    }),
  );

  const availableMonths = Object.keys(stateMonths).sort();
  const cachedMonth = readSessionPreference("activeMonth");
  const activeMonth =
    cachedMonth && stateMonths[cachedMonth]
      ? cachedMonth
      : availableMonths.includes(currentMonthKey())
        ? currentMonthKey()
        : availableMonths.at(-1)!;
  const people = activeProfiles.map((profile) => profile.name);

  return {
    user: { id: user.id, name: displayName },
    state: {
      people,
      activePerson: readSessionPreference("activePerson") || VIEW_ME,
      activeMonth,
      months: stateMonths,
    },
    workspace: { householdId, profiles, months, budgets },
    envelopes,
  };
}

async function findHouseholdId(): Promise<string> {
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .limit(1)
    .maybeSingle();
  throwIfError(error);
  if (!data?.household_id) throw new Error("Nenhuma casa financeira encontrada para este usuario.");
  return String(data.household_id);
}

async function createEmptyMonth(householdId: string, key: string): Promise<MonthRow> {
  const { data, error } = await supabase
    .from("finance_months")
    .insert({
      household_id: householdId,
      period: periodFromKey(key),
      label: formatMonthLabel(key),
      income: 0,
      house_contribution: 0,
      planned: false,
    })
    .select("id, household_id, period, label, income, house_contribution, planned, version")
    .single();
  throwIfError(error);
  return data as MonthRow;
}

export function saveSessionPreference(key: "activeMonth" | "activePerson", value: string): void {
  if (typeof sessionStorage !== "undefined") sessionStorage.setItem(`finance:${key}`, value);
}

function readSessionPreference(key: "activeMonth" | "activePerson"): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(`finance:${key}`);
}

/**
 * Builds the state that becomes the new sync base: `state` (what the user
 * just saved) with `version` patched onto every expense/priority this save
 * actually wrote, using the versions the server just returned. Untouched
 * months/expenses/priorities keep their existing object identity — this is
 * a targeted patch, not a reload. Pure: never mutates its inputs.
 */
export function applyConfirmedVersions(
  state: FinanceState,
  expenseVersions: Map<string, number>,
  priorityVersions: Map<string, number>,
): FinanceState {
  if (!expenseVersions.size && !priorityVersions.size) return state;
  const months = Object.fromEntries(
    Object.entries(state.months).map(([key, month]) => {
      const expenses = expenseVersions.size
        ? month.expenses.map((expense) =>
            expenseVersions.has(expense.id)
              ? { ...expense, version: expenseVersions.get(expense.id) }
              : expense,
          )
        : month.expenses;
      const priorities = priorityVersions.size
        ? month.priorities.map((priority) =>
            priorityVersions.has(priority.id)
              ? { ...priority, version: priorityVersions.get(priority.id) }
              : priority,
          )
        : month.priorities;
      return [key, { ...month, expenses, priorities }];
    }),
  );
  return { ...state, months };
}

export async function saveRemoteFinance(
  workspace: FinanceWorkspace,
  previousState: FinanceState,
  nextState: FinanceState,
): Promise<{ workspace: FinanceWorkspace; state: FinanceState }> {
  const profiles = await syncProfiles(workspace, nextState.people);
  const months = await syncMonths(workspace.householdId, workspace.months, nextState.months);
  const profileIdByName = new Map(profiles.map((profile) => [profile.name, profile.id]));
  const monthIdByKey = new Map(months.map((month) => [monthKey(month.period), month.id]));

  const budgets = await syncBudgets(
    workspace.householdId,
    nextState,
    profileIdByName,
    monthIdByKey,
    workspace.budgets,
  );
  const expenseVersions = await syncExpenses(
    workspace.householdId,
    previousState,
    nextState,
    profileIdByName,
    monthIdByKey,
  );
  const priorityVersions = await syncPriorities(
    workspace.householdId,
    previousState,
    nextState,
    profileIdByName,
    monthIdByKey,
  );

  return {
    workspace: { householdId: workspace.householdId, profiles, months, budgets },
    state: applyConfirmedVersions(nextState, expenseVersions, priorityVersions),
  };
}

/**
 * Diffs two id-keyed lists so callers only write what actually changed.
 * Deliberately does NOT reconcile against a live DB read — a device only
 * knows about entities it has locally, so it must never delete rows it
 * simply hasn't loaded yet (e.g. one just added by another device).
 * Splits changes into `created` (id absent from `previous`, so it must go
 * through a plain INSERT and rely on the column's `default 1` for version)
 * vs. `updated` (id already existed, so it can carry an expected version).
 */
export function diffById<T extends { id: string }>(
  previous: T[],
  next: T[],
): { created: T[]; updated: T[]; deletedIds: string[] } {
  const previousById = new Map(previous.map((item) => [item.id, item]));
  const nextIds = new Set(next.map((item) => item.id));
  const created: T[] = [];
  const updated: T[] = [];
  for (const item of next) {
    const before = previousById.get(item.id);
    if (!before) {
      created.push(item);
    } else if (JSON.stringify(before) !== JSON.stringify(item)) {
      updated.push(item);
    }
  }
  const deletedIds = previous.filter((item) => !nextIds.has(item.id)).map((item) => item.id);
  return { created, updated, deletedIds };
}

type VersionedTable = "expenses" | "priorities" | "finance_months";
type VersionedRow = Record<string, string | number | boolean | null | string[]> & { id: string };
interface VersionedRef {
  id: string;
  version: number;
}

/**
 * "Unknown version" fallback — REMOVAL PLAN (P0-02A follow-up):
 * As of the version-propagation fix (saveRemoteFinance now returns the
 * confirmed state with server-assigned versions merged in, and syncQueue
 * confirms that returned state instead of the raw locally-edited one — see
 * applyConfirmedVersions below), every row that goes through a normal
 * create-then-edit cycle gets its `version` populated immediately after the
 * write that created it. This fallback should now only fire for a client
 * tab that's been open since before this feature shipped, or a genuine bug —
 * it is no longer expected to be a normal, frequent path. It logs
 * console.warn every time it's hit specifically so that stays observable.
 * Once a production rollout has run for a few days with zero such warnings,
 * remove the `expectedVersion === undefined` branches in updateVersionedRow
 * and deleteVersionedRow entirely and make `expectedVersion` a required
 * `number` — turning today's silent-if-unwatched gap into a compile-time
 * guarantee that no versioned write can skip the check.
 */
function warnUnknownVersion(table: VersionedTable, id: string): void {
  console.warn(
    `[P0-02A] ${table} id=${id} written without a known version (unconditional fallback). ` +
      "This should be rare post-rollout — see removal plan above updateVersionedRow.",
  );
}

/**
 * Version-conditional UPDATE. When `expectedVersion` is known, the write is
 * scoped to `id = ? and version = ?` and bumps version by exactly 1. Zero
 * rows affected throws WriteNotAppliedError rather than silently doing
 * nothing — but that zero-rows result is itself ambiguous (stale version,
 * row deleted, or RLS hiding the row from this user all look identical; see
 * WriteNotAppliedError's doc comment), so the error deliberately does not
 * claim a specific cause. Always reads back `id, version` so the caller can
 * learn the row's current server version — including in the fallback path,
 * where the write itself doesn't touch `version` but the read-back still
 * teaches the caller what it is, partially self-healing an unknown version
 * by the next write.
 */
export async function updateVersionedRow(
  table: VersionedTable,
  row: VersionedRow,
  expectedVersion: number | undefined,
): Promise<VersionedRef | null> {
  const { id, ...patch } = row;
  const payload: Record<string, string | number | boolean | null | string[]> = { ...patch };
  if (expectedVersion !== undefined) {
    payload.version = expectedVersion + 1;
  } else {
    warnUnknownVersion(table, id);
  }

  let query = supabase.from(table).update(payload).eq("id", id);
  if (expectedVersion !== undefined) query = query.eq("version", expectedVersion);
  const { data, error } = await query.select("id, version");
  throwIfError(error);
  const rows = (data || []) as VersionedRef[];
  if (expectedVersion !== undefined && rows.length === 0) {
    throw new WriteNotAppliedError(table, id);
  }
  return rows[0] || null;
}

/**
 * Version-conditional DELETE. Same zero-rows-is-ambiguous semantics as
 * updateVersionedRow — see WriteNotAppliedError's doc comment. When
 * `expectedVersion` is known, also confirms that exactly the expected row
 * (and no other) was removed — not just that "some" row matched.
 */
export async function deleteVersionedRow(
  table: VersionedTable,
  id: string,
  expectedVersion: number | undefined,
): Promise<void> {
  if (expectedVersion === undefined) warnUnknownVersion(table, id);

  let query = supabase.from(table).delete().eq("id", id);
  if (expectedVersion !== undefined) query = query.eq("version", expectedVersion);
  const { data, error } = await query.select("id");
  throwIfError(error);
  const rows = (data || []) as { id: string }[];
  if (expectedVersion !== undefined && (rows.length !== 1 || rows[0].id !== id)) {
    throw new WriteNotAppliedError(table, id);
  }
}

/** Plain batch INSERT — new rows always start at the column's `default 1`, never an app-supplied version. Reads back id+version so the caller learns the assigned version immediately. */
async function insertRows(table: VersionedTable, rows: VersionedRow[]): Promise<VersionedRef[]> {
  if (!rows.length) return [];
  const { data, error } = await supabase.from(table).insert(rows).select("id, version");
  throwIfError(error);
  return (data || []) as VersionedRef[];
}

/**
 * profile_budgets-only versioned write helpers.
 *
 * Deliberately NOT sharing insertRows/updateVersionedRow/deleteVersionedRow
 * above: this table has no `id` column (its identity is the composite
 * (month_id, profile_id) primary key), so reusing those would mean changing
 * their signature — and therefore every expenses/priorities/finance_months
 * call site — for a shape only this one table needs. Duplicating the small
 * amount of logic keeps this table's optimistic-concurrency support fully
 * isolated: zero risk of regressing the other three tables' already-proven
 * OCC behavior.
 */

export function budgetIdentity(monthId: string, profileId: string): string {
  return `${monthId}:${profileId}`;
}

/**
 * INSERT for a brand-new (month_id, profile_id) pair — version starts at the
 * column's `default 1`. Two devices racing to create the same budget line
 * hit the composite primary key: Postgres rejects the loser with SQLSTATE
 * 23505 (unique_violation on profile_budgets_pkey), confirmed empirically
 * against the real database, including with two genuinely concurrent
 * inserts. That's converted to the same neutral WriteNotAppliedError the
 * update/delete paths already throw — never the raw SQL message or
 * constraint name.
 */
export async function insertBudgetRow(row: {
  household_id: string;
  month_id: string;
  profile_id: string;
  amount: number;
}): Promise<void> {
  const { error } = await supabase.from("profile_budgets").insert(row);
  if (!error) return;
  if (error.code === "23505") {
    throw new WriteNotAppliedError("profile_budgets", budgetIdentity(row.month_id, row.profile_id));
  }
  throwIfError(error);
}

/**
 * Version-conditional UPDATE keyed by (month_id, profile_id) instead of an
 * `id`. Same zero-rows-is-ambiguous semantics as updateVersionedRow above —
 * see WriteNotAppliedError's doc comment. `expectedVersion` unknown falls
 * back to an unconditional update, matching pre-OCC behavior; this should be
 * rare in practice since workspace.budgets is fully refreshed after every
 * sync (see syncBudgets), unlike expenses/priorities which rely on a
 * different propagation path.
 */
export async function updateVersionedBudget(
  monthId: string,
  profileId: string,
  amount: number,
  expectedVersion: number | undefined,
): Promise<void> {
  const payload: Record<string, number> = { amount };
  if (expectedVersion !== undefined) {
    payload.version = expectedVersion + 1;
  } else {
    console.warn(
      `[P0-02C] profile_budgets ${budgetIdentity(monthId, profileId)} written without a known version (unconditional fallback).`,
    );
  }

  let query = supabase
    .from("profile_budgets")
    .update(payload)
    .eq("month_id", monthId)
    .eq("profile_id", profileId);
  if (expectedVersion !== undefined) query = query.eq("version", expectedVersion);
  const { data, error } = await query.select("month_id, profile_id");
  throwIfError(error);
  if (expectedVersion !== undefined && (!data || data.length === 0)) {
    throw new WriteNotAppliedError("profile_budgets", budgetIdentity(monthId, profileId));
  }
}

/** Version-conditional DELETE keyed by (month_id, profile_id). Same semantics as deleteVersionedRow above. */
export async function deleteVersionedBudget(
  monthId: string,
  profileId: string,
  expectedVersion: number | undefined,
): Promise<void> {
  if (expectedVersion === undefined) {
    console.warn(
      `[P0-02C] profile_budgets ${budgetIdentity(monthId, profileId)} deleted without a known version (unconditional fallback).`,
    );
  }

  let query = supabase
    .from("profile_budgets")
    .delete()
    .eq("month_id", monthId)
    .eq("profile_id", profileId);
  if (expectedVersion !== undefined) query = query.eq("version", expectedVersion);
  const { data, error } = await query.select("month_id, profile_id");
  throwIfError(error);
  const rows = (data || []) as { month_id: string; profile_id: string }[];
  const matchedExpected =
    rows.length === 1 && rows[0].month_id === monthId && rows[0].profile_id === profileId;
  if (expectedVersion !== undefined && !matchedExpected) {
    throw new WriteNotAppliedError("profile_budgets", budgetIdentity(monthId, profileId));
  }
}

/** Envelopes are a short, rarely-edited list, so a full live-diff replace is fine here. */
async function replaceEnvelopeRows(
  householdId: string,
  rows: Array<Record<string, string | number | boolean | null | string[]>>,
): Promise<void> {
  const { data: existing, error: readError } = await supabase
    .from("envelopes")
    .select("id")
    .eq("household_id", householdId);
  throwIfError(readError);

  if (rows.length) {
    const { error } = await supabase.from("envelopes").upsert(rows, { onConflict: "id" });
    throwIfError(error);
  }

  const activeIds = new Set(rows.map((row) => String(row.id)));
  const staleIds = (existing || []).map((row) => row.id).filter((id) => !activeIds.has(id));
  if (staleIds.length) {
    const { error } = await supabase.from("envelopes").delete().in("id", staleIds);
    throwIfError(error);
  }
}

export async function saveRemoteEnvelopes(
  householdId: string,
  envelopes: EnvelopeRule[],
): Promise<EnvelopeRule[]> {
  const normalized = envelopes.map((envelope) => ({
    ...envelope,
    id: validId(envelope.id),
  }));
  const rows = normalized.map((envelope) => ({
    id: envelope.id,
    household_id: householdId,
    name: envelope.label.trim() || "Envelope",
    category: envelope.categories[0] || "Outros",
    categories: envelope.categories.length ? envelope.categories : ["Outros"],
    monthly_limit: Math.max(0, envelope.limit),
  }));
  await replaceEnvelopeRows(householdId, rows);
  return normalized;
}

async function syncProfiles(workspace: FinanceWorkspace, people: string[]): Promise<ProfileRow[]> {
  const existing = [...workspace.profiles].sort((a, b) => a.sort_order - b.sort_order);
  const rows = people.map((name, index) => {
    const sameName = existing.find((profile) => profile.name === name);
    const profile = sameName || existing[index];
    return {
      id: profile?.id || crypto.randomUUID(),
      household_id: workspace.householdId,
      name,
      kind: profile?.kind || (index === 0 ? "household" : "managed"),
      sort_order: index,
      active: true,
    };
  });

  const { data, error } = await supabase
    .from("financial_profiles")
    .upsert(rows, { onConflict: "id" })
    .select("id, household_id, name, kind, sort_order, active");
  throwIfError(error);

  const activeIds = rows.map((row) => row.id);
  const staleIds = existing.map((profile) => profile.id).filter((id) => !activeIds.includes(id));
  if (staleIds.length) {
    const { error: deactivateError } = await supabase
      .from("financial_profiles")
      .update({ active: false })
      .in("id", staleIds);
    throwIfError(deactivateError);
  }

  const saved = (data || []) as ProfileRow[];
  const inactive = existing
    .filter((profile) => staleIds.includes(profile.id))
    .map((profile) => ({ ...profile, active: false }));
  return [...saved, ...inactive].sort((a, b) => a.sort_order - b.sort_order);
}

async function syncMonths(
  householdId: string,
  existing: MonthRow[],
  months: Record<string, MonthData>,
): Promise<MonthRow[]> {
  const byKey = new Map(existing.map((month) => [monthKey(month.period), month]));

  const toInsert: VersionedRow[] = [];
  const toUpdate: Array<{ row: VersionedRow; expectedVersion: number | undefined }> = [];

  for (const [key, month] of Object.entries(months)) {
    const existingRow = byKey.get(key);
    const row: VersionedRow = {
      id: existingRow?.id || crypto.randomUUID(),
      household_id: householdId,
      period: periodFromKey(key),
      label: month.label || formatMonthLabel(key),
      income: month.income,
      house_contribution: month.houseContribution,
      planned: Boolean(month.planned),
    };
    if (!existingRow) {
      toInsert.push(row);
      continue;
    }
    const changed =
      existingRow.label !== row.label ||
      numberValue(existingRow.income) !== row.income ||
      numberValue(existingRow.house_contribution) !== row.house_contribution ||
      existingRow.planned !== row.planned;
    if (changed) {
      toUpdate.push({ row, expectedVersion: existingRow.version });
    }
  }

  await insertRows("finance_months", toInsert);
  for (const { row, expectedVersion } of toUpdate) {
    await updateVersionedRow("finance_months", row, expectedVersion);
  }

  // Cascades to that month's budgets/expenses/priorities (FK ON DELETE CASCADE).
  const keptKeys = new Set(Object.keys(months));
  const staleMonths = existing.filter((row) => !keptKeys.has(monthKey(row.period)));
  for (const staleMonth of staleMonths) {
    await deleteVersionedRow("finance_months", staleMonth.id, staleMonth.version);
  }

  // Re-fetched (rather than assembled in-memory) so the returned rows always
  // carry the authoritative, current version — including for rows this call
  // didn't touch at all.
  const { data, error } = await supabase
    .from("finance_months")
    .select("id, household_id, period, label, income, house_contribution, planned, version")
    .eq("household_id", householdId)
    .order("period");
  throwIfError(error);
  return data as MonthRow[];
}

/**
 * Syncs profile_budgets incrementally (P0-02A follow-up, P0-02C): diffs
 * `nextState`'s budgets against `existingBudgets` — always
 * `workspace.budgets`, itself a full re-select after every prior sync, so it
 * doubles as both the version source and the "did this actually change"
 * source — and writes only created/updated/deleted rows. Untouched budgets
 * get zero requests.
 *
 * This replaces the previous delete-all-then-reinsert-all, which rewrote
 * every month's budgets in the household on every save regardless of what
 * the user touched, and could silently lose a concurrent device's write
 * with no conflict signal at all (see the P0-02A/P0-02C planning notes).
 */
export async function syncBudgets(
  householdId: string,
  nextState: FinanceState,
  profileIds: Map<string, string>,
  monthIds: Map<string, string>,
  existingBudgets: BudgetRow[],
): Promise<BudgetRow[]> {
  const existingByKey = new Map(
    existingBudgets.map((budget) => [budgetIdentity(budget.month_id, budget.profile_id), budget]),
  );

  const nextEntries = Object.entries(nextState.months).flatMap(([key, month]) =>
    Object.entries(month.profileBudgets || {}).flatMap(([profileName, amount]) => {
      const monthId = monthIds.get(key);
      const profileId = profileIds.get(profileName);
      return monthId && profileId ? [{ monthId, profileId, amount }] : [];
    }),
  );
  const nextKeys = new Set(
    nextEntries.map((entry) => budgetIdentity(entry.monthId, entry.profileId)),
  );

  for (const entry of nextEntries) {
    const key = budgetIdentity(entry.monthId, entry.profileId);
    const existing = existingByKey.get(key);
    if (!existing) {
      await insertBudgetRow({
        household_id: householdId,
        month_id: entry.monthId,
        profile_id: entry.profileId,
        amount: entry.amount,
      });
    } else if (numberValue(existing.amount) !== entry.amount) {
      await updateVersionedBudget(entry.monthId, entry.profileId, entry.amount, existing.version);
    }
    // Unchanged: no write at all — this is the fix for "touches unrelated budgets".
  }

  for (const existing of existingBudgets) {
    if (!nextKeys.has(budgetIdentity(existing.month_id, existing.profile_id))) {
      await deleteVersionedBudget(existing.month_id, existing.profile_id, existing.version);
    }
  }

  // Re-fetched (rather than assembled in-memory) so the returned rows always
  // carry the authoritative, current version — same pattern as syncMonths.
  const { data, error } = await supabase
    .from("profile_budgets")
    .select("household_id, month_id, profile_id, amount, version")
    .eq("household_id", householdId);
  throwIfError(error);
  return (data || []) as BudgetRow[];
}

function buildExpenseRow(
  householdId: string,
  monthId: string,
  ownerId: string,
  paidById: string,
  expense: Expense,
): VersionedRow {
  expense.id = validId(expense.id);
  return {
    id: expense.id,
    household_id: householdId,
    month_id: monthId,
    owner_profile_id: ownerId,
    paid_by_profile_id: paidById,
    description: expense.name,
    entry_type: expense.type || "expense",
    category: expense.category,
    amount: expense.amount,
    status: expense.status,
    expense_date: expense.date,
    due_date: expense.dueDate || expense.date,
    competence: `${expense.competence || expense.date.slice(0, 7)}-01`,
    payment_method: expense.paymentMethod,
    note: expense.note || "",
    recurring: Boolean(expense.recurring),
    recurring_key:
      expense.recurringKey && isUuid(expense.recurringKey) ? expense.recurringKey : null,
    installment_key:
      expense.installmentKey && isUuid(expense.installmentKey) ? expense.installmentKey : null,
    installment_number: expense.installmentNumber || null,
    installment_total: expense.installmentTotal || null,
  };
}

/**
 * Writes the expense diff and returns the server-confirmed version of every
 * row this call created or updated (id -> version). The caller merges this
 * into the state that becomes the new sync base, so the *next* save already
 * knows the right version — no reload required.
 */
export async function syncExpenses(
  householdId: string,
  previousState: FinanceState,
  state: FinanceState,
  profileIds: Map<string, string>,
  monthIds: Map<string, string>,
): Promise<Map<string, number>> {
  const fallbackProfileId = profileIds.values().next().value as string | undefined;
  const previousExpenses = Object.values(previousState.months).flatMap((month) => month.expenses);
  const previousById = new Map(previousExpenses.map((expense) => [expense.id, expense]));
  const nextExpenses = Object.entries(state.months).flatMap(([key, month]) =>
    month.expenses.map((expense) => ({ key, expense })),
  );
  const { created, updated, deletedIds } = diffById(
    previousExpenses,
    nextExpenses.map(({ expense }) => expense),
  );
  const createdIds = new Set(created.map((expense) => expense.id));
  const updatedIds = new Set(updated.map((expense) => expense.id));

  const toInsert: VersionedRow[] = [];
  const toUpdate: Array<{ row: VersionedRow; expectedVersion: number | undefined }> = [];
  for (const { key, expense } of nextExpenses) {
    if (!createdIds.has(expense.id) && !updatedIds.has(expense.id)) continue;
    const monthId = monthIds.get(key);
    const ownerId = profileIds.get(expense.owner) || fallbackProfileId;
    if (!monthId || !ownerId) continue;
    const paidById = profileIds.get(expense.paidBy || expense.owner) || ownerId;
    const originalId = expense.id;
    const row = buildExpenseRow(householdId, monthId, ownerId, paidById, expense);
    if (createdIds.has(originalId)) {
      toInsert.push(row);
    } else {
      toUpdate.push({ row, expectedVersion: previousById.get(originalId)?.version });
    }
  }

  const versions = new Map<string, number>();
  for (const inserted of await insertRows("expenses", toInsert)) {
    versions.set(inserted.id, inserted.version);
  }
  for (const { row, expectedVersion } of toUpdate) {
    const written = await updateVersionedRow("expenses", row, expectedVersion);
    if (written) versions.set(written.id, written.version);
  }
  for (const id of deletedIds) {
    await deleteVersionedRow("expenses", validId(id), previousById.get(id)?.version);
  }
  return versions;
}

function buildPriorityRow(
  householdId: string,
  monthId: string,
  profileId: string,
  priority: Priority,
): VersionedRow {
  priority.id = validId(priority.id);
  return {
    id: priority.id,
    household_id: householdId,
    month_id: monthId,
    profile_id: profileId,
    description: priority.name,
    target_amount: priority.amount,
    saved_amount: priority.saved || 0,
    priority: priority.rank,
    status: priority.status,
  };
}

/** Same contract as syncExpenses above, for priorities. */
export async function syncPriorities(
  householdId: string,
  previousState: FinanceState,
  state: FinanceState,
  profileIds: Map<string, string>,
  monthIds: Map<string, string>,
): Promise<Map<string, number>> {
  const fallbackProfileId = profileIds.values().next().value as string | undefined;
  const previousPriorities = Object.values(previousState.months).flatMap(
    (month) => month.priorities,
  );
  const previousById = new Map(previousPriorities.map((priority) => [priority.id, priority]));
  const nextPriorities = Object.entries(state.months).flatMap(([key, month]) =>
    month.priorities.map((priority) => ({ key, priority })),
  );
  const { created, updated, deletedIds } = diffById(
    previousPriorities,
    nextPriorities.map(({ priority }) => priority),
  );
  const createdIds = new Set(created.map((priority) => priority.id));
  const updatedIds = new Set(updated.map((priority) => priority.id));

  const toInsert: VersionedRow[] = [];
  const toUpdate: Array<{ row: VersionedRow; expectedVersion: number | undefined }> = [];
  for (const { key, priority } of nextPriorities) {
    if (!createdIds.has(priority.id) && !updatedIds.has(priority.id)) continue;
    const monthId = monthIds.get(key);
    const profileId = profileIds.get(priority.responsavel) || fallbackProfileId;
    if (!monthId || !profileId) continue;
    const originalId = priority.id;
    const row = buildPriorityRow(householdId, monthId, profileId, priority);
    if (createdIds.has(originalId)) {
      toInsert.push(row);
    } else {
      toUpdate.push({ row, expectedVersion: previousById.get(originalId)?.version });
    }
  }

  const versions = new Map<string, number>();
  for (const inserted of await insertRows("priorities", toInsert)) {
    versions.set(inserted.id, inserted.version);
  }
  for (const { row, expectedVersion } of toUpdate) {
    const written = await updateVersionedRow("priorities", row, expectedVersion);
    if (written) versions.set(written.id, written.version);
  }
  for (const id of deletedIds) {
    await deleteVersionedRow("priorities", validId(id), previousById.get(id)?.version);
  }
  return versions;
}
