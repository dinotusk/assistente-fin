// localStorage persistence + profile management + state migration.
// Client-only (guards for window). Mirrors the original app's behavior.
import {
  ACTIVE_PROFILE_KEY,
  DEFAULT_FAMILY_PEOPLE,
  PROFILES_KEY,
  STORAGE_KEY,
  VIEW_ME,
  VIEW_SPOUSE,
  VIEW_ALL,
  categories,
} from "./constants";
import { profileId, responsavelToView } from "./calc";
import { createSeedState, uid } from "./seed";
import type { ActiveUser, Expense, FinanceState, Profile } from "./types";

const hasWindow = typeof window !== "undefined";

export function getProfiles(): Profile[] {
  if (!hasWindow) return [];
  try {
    const profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]");
    return Array.isArray(profiles) ? profiles : [];
  } catch {
    return [];
  }
}

export function saveProfiles(profiles: Profile[]): void {
  if (!hasWindow) return;
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

function profileStateKey(user: ActiveUser): string {
  return `${STORAGE_KEY}:${user.id}`;
}

export function loadActiveUser(): ActiveUser | null {
  if (!hasWindow) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(ACTIVE_PROFILE_KEY) || "null");
    if (!saved?.id) return null;
    const profile = getProfiles().find((item) => item.id === saved.id);
    return profile ? { id: profile.id, name: profile.name } : null;
  } catch {
    return null;
  }
}

export function setActiveUser(user: ActiveUser | null): void {
  if (!hasWindow) return;
  if (user) localStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(user));
  else localStorage.removeItem(ACTIVE_PROFILE_KEY);
}

function normalizeExpense(expense: Partial<Expense>, monthKey: string): Expense {
  return {
    id: expense.id || uid(),
    name: expense.name || (expense as { description?: string }).description || "Gasto sem descrição",
    category: categories.includes(expense.category || "") ? (expense.category as string) : "Outros",
    amount: Number(expense.amount || 0),
    status: expense.status === "Pago" ? "Pago" : "A pagar",
    owner: expense.owner || DEFAULT_FAMILY_PEOPLE[0],
    note: expense.note || "",
    date: expense.date || `${monthKey}-05`,
    paymentMethod: expense.paymentMethod || "Pix",
    createdAt: expense.createdAt,
  };
}

export function migrateState(nextState: FinanceState, loginName = ""): FinanceState {
  const legacyOwners: Record<string, string> = {
    "Pessoa 1": "Minha casa",
    "Pessoa 2": "Pai da namorada",
    "Meu perfil": "Minha casa",
    [loginName]: "Minha casa",
    Esposa: "Pai da namorada",
    "Todos/Casal": "Minha casa",
    Casal: "Minha casa",
    Todos: "Minha casa",
    "Minha casa": "Minha casa",
    "Pai da namorada": "Pai da namorada",
  };
  const savedPeople = Array.isArray(nextState.people) ? nextState.people : [];
  nextState.people = [
    String(savedPeople[0] || DEFAULT_FAMILY_PEOPLE[0]).trim() || DEFAULT_FAMILY_PEOPLE[0],
    String(savedPeople[1] || DEFAULT_FAMILY_PEOPLE[1]).trim() || DEFAULT_FAMILY_PEOPLE[1],
  ];
  Object.entries(nextState.months || {}).forEach(([monthKey, data]) => {
    data.expenses = (data.expenses || []).map((expense) => normalizeExpense(expense, monthKey));
    data.expenses.forEach((expense) => {
      expense.owner = legacyOwners[expense.owner] || expense.owner;
    });
    data.priorities = data.priorities || [];
    data.priorities.forEach((priority) => {
      priority.responsavel = legacyOwners[priority.responsavel] || priority.responsavel || "Minha casa";
    });
    data.income = Number(data.income || 0);
    data.houseContribution = Number(data.houseContribution || 0);
    data.profileBudgets = data.profileBudgets || {};
  });
  const migratedView = responsavelToView(nextState.activePerson);
  nextState.activePerson = [VIEW_ALL, VIEW_ME, VIEW_SPOUSE, ...nextState.people].includes(migratedView) ? migratedView : VIEW_ME;
  nextState.activeMonth = nextState.months[nextState.activeMonth]
    ? nextState.activeMonth
    : Object.keys(nextState.months)[0];
  return nextState;
}

export function loadState(activeUser: ActiveUser | null): FinanceState {
  if (!hasWindow) return migrateState(createSeedState());
  const key = activeUser ? profileStateKey(activeUser) : STORAGE_KEY;
  const saved = localStorage.getItem(key) || (activeUser ? localStorage.getItem(STORAGE_KEY) : null);
  if (!saved) return migrateState(createSeedState(), activeUser?.name);
  try {
    const parsed = JSON.parse(saved);
    return migrateState(parsed.months ? parsed : createSeedState(), activeUser?.name);
  } catch {
    return migrateState(createSeedState(), activeUser?.name);
  }
}

export function saveState(state: FinanceState, activeUser: ActiveUser | null): void {
  if (!hasWindow) return;
  const key = activeUser ? profileStateKey(activeUser) : STORAGE_KEY;
  localStorage.setItem(key, JSON.stringify(state));
}

/** Local login fallback (used when no Google Sheets API is configured). */
export function localLogin(name: string, pin: string): Profile {
  const profiles = getProfiles();
  const id = profileId(name);
  const profile = profiles.find((item) => item.id === id);
  if (profile && profile.pin !== pin) throw new Error("PIN incorreto");
  return { id: profile?.id || id, name: profile?.name || name, pin };
}
