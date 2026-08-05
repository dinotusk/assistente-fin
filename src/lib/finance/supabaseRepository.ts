import type { User } from "@supabase/supabase-js";

import { formatMonthLabel } from "./calc";
import { VIEW_ME } from "./constants";
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
}

interface BudgetRow {
  month_id: string;
  profile_id: string;
  amount: number | string;
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

  if (!data.user) throw new Error("Nao foi possivel criar o usuario.");
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
      .select("id, household_id, period, label, income, house_contribution, planned")
      .eq("household_id", householdId)
      .order("period"),
    supabase
      .from("profile_budgets")
      .select("month_id, profile_id, amount")
      .eq("household_id", householdId),
    supabase
      .from("expenses")
      .select(
        "id, month_id, owner_profile_id, paid_by_profile_id, description, entry_type, category, amount, status, expense_date, due_date, competence, payment_method, note, recurring, recurring_key, installment_key, installment_number, installment_total, created_at",
      )
      .eq("household_id", householdId)
      .order("expense_date"),
    supabase
      .from("priorities")
      .select(
        "id, month_id, profile_id, description, target_amount, saved_amount, priority, status, created_at",
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
    workspace: { householdId, profiles, months },
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
    .select("id, household_id, period, label, income, house_contribution, planned")
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

export async function saveRemoteFinance(
  workspace: FinanceWorkspace,
  previousState: FinanceState,
  nextState: FinanceState,
): Promise<FinanceWorkspace> {
  const profiles = await syncProfiles(workspace, nextState.people);
  const months = await syncMonths(workspace.householdId, workspace.months, nextState.months);
  const profileIdByName = new Map(profiles.map((profile) => [profile.name, profile.id]));
  const monthIdByKey = new Map(months.map((month) => [monthKey(month.period), month.id]));

  await syncBudgets(workspace.householdId, nextState, profileIdByName, monthIdByKey);
  await syncExpenses(
    workspace.householdId,
    previousState,
    nextState,
    profileIdByName,
    monthIdByKey,
  );
  await syncPriorities(
    workspace.householdId,
    previousState,
    nextState,
    profileIdByName,
    monthIdByKey,
  );

  return { householdId: workspace.householdId, profiles, months };
}

/**
 * Diffs two id-keyed lists so callers only write what actually changed.
 * Deliberately does NOT reconcile against a live DB read — a device only
 * knows about entities it has locally, so it must never delete rows it
 * simply hasn't loaded yet (e.g. one just added by another device).
 */
function diffById<T extends { id: string }>(
  previous: T[],
  next: T[],
): { changed: T[]; deletedIds: string[] } {
  const previousById = new Map(previous.map((item) => [item.id, item]));
  const nextIds = new Set(next.map((item) => item.id));
  const changed = next.filter((item) => {
    const before = previousById.get(item.id);
    return !before || JSON.stringify(before) !== JSON.stringify(item);
  });
  const deletedIds = previous.filter((item) => !nextIds.has(item.id)).map((item) => item.id);
  return { changed, deletedIds };
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
  const rows = Object.entries(months).map(([key, month]) => ({
    id: byKey.get(key)?.id || crypto.randomUUID(),
    household_id: householdId,
    period: periodFromKey(key),
    label: month.label || formatMonthLabel(key),
    income: month.income,
    house_contribution: month.houseContribution,
    planned: Boolean(month.planned),
  }));
  const { data, error } = await supabase
    .from("finance_months")
    .upsert(rows, { onConflict: "id" })
    .select("id, household_id, period, label, income, house_contribution, planned");
  throwIfError(error);

  // Cascades to that month's budgets/expenses/priorities (FK ON DELETE CASCADE).
  const keptKeys = new Set(Object.keys(months));
  const staleIds = existing
    .filter((row) => !keptKeys.has(monthKey(row.period)))
    .map((row) => row.id);
  if (staleIds.length) {
    const { error: deleteError } = await supabase
      .from("finance_months")
      .delete()
      .in("id", staleIds);
    throwIfError(deleteError);
  }

  return data as MonthRow[];
}

async function syncBudgets(
  householdId: string,
  state: FinanceState,
  profileIds: Map<string, string>,
  monthIds: Map<string, string>,
): Promise<void> {
  const targetMonthIds = [...monthIds.values()];
  if (targetMonthIds.length) {
    const { error } = await supabase
      .from("profile_budgets")
      .delete()
      .in("month_id", targetMonthIds);
    throwIfError(error);
  }

  const rows = Object.entries(state.months).flatMap(([key, month]) =>
    Object.entries(month.profileBudgets || {}).flatMap(([profileName, amount]) => {
      const monthId = monthIds.get(key);
      const profileId = profileIds.get(profileName);
      return monthId && profileId
        ? [{ household_id: householdId, month_id: monthId, profile_id: profileId, amount }]
        : [];
    }),
  );
  if (!rows.length) return;
  const { error } = await supabase.from("profile_budgets").insert(rows);
  throwIfError(error);
}

async function syncExpenses(
  householdId: string,
  previousState: FinanceState,
  state: FinanceState,
  profileIds: Map<string, string>,
  monthIds: Map<string, string>,
): Promise<void> {
  const fallbackProfileId = profileIds.values().next().value as string | undefined;
  const previousExpenses = Object.values(previousState.months).flatMap((month) => month.expenses);
  const nextExpenses = Object.entries(state.months).flatMap(([key, month]) =>
    month.expenses.map((expense) => ({ key, expense })),
  );
  const { changed, deletedIds } = diffById(
    previousExpenses,
    nextExpenses.map(({ expense }) => expense),
  );
  const changedIds = new Set(changed.map((expense) => expense.id));

  const rows = nextExpenses
    .filter(({ expense }) => changedIds.has(expense.id))
    .flatMap(({ key, expense }) => {
      const monthId = monthIds.get(key);
      const ownerId = profileIds.get(expense.owner) || fallbackProfileId;
      if (!monthId || !ownerId) return [];
      const paidById = profileIds.get(expense.paidBy || expense.owner) || ownerId;
      expense.id = validId(expense.id);
      return [
        {
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
            expense.installmentKey && isUuid(expense.installmentKey)
              ? expense.installmentKey
              : null,
          installment_number: expense.installmentNumber || null,
          installment_total: expense.installmentTotal || null,
        },
      ];
    });
  await upsertAndDelete("expenses", rows, deletedIds.map(validId));
}

async function syncPriorities(
  householdId: string,
  previousState: FinanceState,
  state: FinanceState,
  profileIds: Map<string, string>,
  monthIds: Map<string, string>,
): Promise<void> {
  const fallbackProfileId = profileIds.values().next().value as string | undefined;
  const previousPriorities = Object.values(previousState.months).flatMap(
    (month) => month.priorities,
  );
  const nextPriorities = Object.entries(state.months).flatMap(([key, month]) =>
    month.priorities.map((priority) => ({ key, priority })),
  );
  const { changed, deletedIds } = diffById(
    previousPriorities,
    nextPriorities.map(({ priority }) => priority),
  );
  const changedIds = new Set(changed.map((priority) => priority.id));

  const rows = nextPriorities
    .filter(({ priority }) => changedIds.has(priority.id))
    .flatMap(({ key, priority }) => {
      const monthId = monthIds.get(key);
      const profileId = profileIds.get(priority.responsavel) || fallbackProfileId;
      if (!monthId || !profileId) return [];
      priority.id = validId(priority.id);
      return [
        {
          id: priority.id,
          household_id: householdId,
          month_id: monthId,
          profile_id: profileId,
          description: priority.name,
          target_amount: priority.amount,
          saved_amount: priority.saved || 0,
          priority: priority.rank,
          status: priority.status,
        },
      ];
    });
  await upsertAndDelete("priorities", rows, deletedIds.map(validId));
}

async function upsertAndDelete(
  table: "expenses" | "priorities",
  rows: Array<Record<string, string | number | boolean | null | string[]>>,
  deleteIds: string[],
): Promise<void> {
  if (rows.length) {
    const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
    throwIfError(error);
  }
  if (deleteIds.length) {
    const { error } = await supabase.from(table).delete().in("id", deleteIds);
    throwIfError(error);
  }
}
