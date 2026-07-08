// Pure formatting + calculation helpers. No side effects — safe for SSR.
import {
  DEFAULT_FAMILY_PEOPLE,
  VIEW_ALL,
  VIEW_ME,
  VIEW_SPOUSE,
  RESPONSAVEL_CASAL,
  categories,
  categoryIcons,
} from "./constants";
import type { Expense, FinanceState, MonthData, Priority } from "./types";

export function money(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Compact currency for tight chart labels, e.g. R$ 1,2 mil. */
export function moneyShort(value: number): string {
  const v = Number(value || 0);
  if (Math.abs(v) >= 1000) return `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return money(v);
}

export function formatDate(value?: string): string {
  if (!value) return "--";
  const [year, monthNumber, day] = value.split("-");
  return `${day}/${monthNumber}/${year}`;
}

export function categoryLabel(category: string): string {
  return `${categoryIcons[category] || categoryIcons.Outros} ${category}`;
}

export function sum(items: { amount?: number }[]): number {
  return items.reduce((total, item) => total + Number(item.amount || 0), 0);
}

export function currentUserName(): string {
  return DEFAULT_FAMILY_PEOPLE[0];
}
export function spouseName(): string {
  return DEFAULT_FAMILY_PEOPLE[1];
}

export function resolveViewOwner(view: string): string | null {
  if (view === VIEW_ME) return currentUserName();
  if (view === VIEW_SPOUSE) return spouseName();
  if ((DEFAULT_FAMILY_PEOPLE as readonly string[]).includes(view)) return view;
  if (view && view !== VIEW_ALL) return view;
  return null;
}

export function viewLabel(view: string): string {
  if (view === VIEW_ALL) return "Tudo";
  if (view === VIEW_ME) return currentUserName();
  if (view === VIEW_SPOUSE) return spouseName();
  return view || currentUserName();
}

export function viewLabelForPeople(view: string, people?: string[]): string {
  if (view === VIEW_ALL) return "Tudo junto";
  if (view === VIEW_ME) return people?.[0] || currentUserName();
  if (view === VIEW_SPOUSE) return people?.[1] || spouseName();
  if (people?.includes(view)) return view;
  return view || people?.[0] || currentUserName();
}

export function ownerLabelForPeople(owner: string, people?: string[]): string {
  if (owner === currentUserName()) return people?.[0] || currentUserName();
  if (owner === spouseName()) return people?.[1] || spouseName();
  return owner;
}

export function responsavelToView(responsavel?: string): string {
  if (!responsavel || responsavel === VIEW_ALL || responsavel === "Todos") return VIEW_ALL;
  if (responsavel === RESPONSAVEL_CASAL || responsavel === "Casal") return VIEW_ME;
  if (["Meu perfil", "Pessoa 1", "Minha casa"].includes(responsavel)) return VIEW_ME;
  if (["Esposa", "Pessoa 2", "Pai da namorada"].includes(responsavel)) return VIEW_SPOUSE;
  if (responsavel === VIEW_ME || responsavel === currentUserName()) return VIEW_ME;
  if (responsavel === VIEW_SPOUSE || responsavel === spouseName()) return VIEW_SPOUSE;
  return responsavel;
}

export function expenseMatchesView(expense: Expense, view: string): boolean {
  const owner = resolveViewOwner(view);
  if (!owner) return true;
  return expense.owner === owner;
}

export function priorityMatchesView(priority: Priority, view: string): boolean {
  const owner = resolveViewOwner(view);
  const responsible = priority.responsavel || currentUserName();
  if (!owner) return true;
  return responsible === owner;
}

export function expensesForView(monthData: MonthData, view: string): Expense[] {
  return (monthData.expenses || []).filter((item) => expenseMatchesView(item, view));
}

export function budgetForView(monthData: MonthData, view: string): number {
  if (view === VIEW_ALL) return Number(monthData.income || 0) + Number(monthData.houseContribution || 0);
  if (view === VIEW_SPOUSE) return Number(monthData.houseContribution || 0);
  return Number(monthData.income || 0);
}

export interface CategoryTotal {
  category: string;
  total: number;
}

export function getCategoryTotals(monthData: MonthData, view: string): CategoryTotal[] {
  const expenses = expensesForView(monthData, view);
  return categories
    .map((category) => ({ category, total: sum(expenses.filter((item) => item.category === category)) }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total);
}

export interface Metrics {
  total: number;
  pending: number;
  paid: number;
  free: number;
  saving: number;
  topCategory?: CategoryTotal;
  paidRate: number;
  daysLeft: number;
  budget: number;
}

export function calc(monthData: MonthData, view: string): Metrics {
  const expenses = expensesForView(monthData, view);
  const budget = budgetForView(monthData, view);
  const total = sum(expenses);
  const pending = sum(expenses.filter((item) => item.status === "A pagar"));
  const paid = sum(expenses.filter((item) => item.status === "Pago"));
  const free = budget - total;
  const saving = Math.max(0, budget - paid);
  const byCategory = getCategoryTotals(monthData, view);
  const topCategory = byCategory[0];
  const now = new Date();
  const daysLeft = Math.max(1, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1);
  return { total, pending, paid, free, saving, topCategory, paidRate: total ? paid / total : 0, daysLeft, budget };
}

export function sortedMonthEntries(state: FinanceState): [string, MonthData][] {
  return Object.entries(state.months).sort(([a], [b]) => a.localeCompare(b));
}

export function currentCalendarMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function timelineMonthEntries(state: FinanceState): [string, MonthData][] {
  const entries = sortedMonthEntries(state);
  const calKey = currentCalendarMonthKey();
  const currentKey = state.months[calKey] ? calKey : state.activeMonth;
  const currentEntry = entries.find(([key]) => key === currentKey);
  const previous = entries.filter(([key]) => key < currentKey).sort(([a], [b]) => b.localeCompare(a));
  const future = entries.filter(([key]) => key > currentKey);
  return currentEntry ? [currentEntry, ...previous, ...future] : entries;
}

export function chartMonthEntries(state: FinanceState, limit = 6): [string, MonthData][] {
  const endKey = state.activeMonth || currentCalendarMonthKey();
  const entries = sortedMonthEntries(state).filter(([key]) => key <= endKey);
  return (entries.length ? entries : sortedMonthEntries(state)).slice(-limit);
}

export function getNextMonthKey(key: string): string {
  const [year, monthNumber] = key.split("-").map(Number);
  const date = new Date(year, monthNumber, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(key: string): string {
  const [year, monthNumber] = key.split("-").map(Number);
  const date = new Date(year, monthNumber - 1, 1);
  const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function getLargestCategoryGrowth(state: FinanceState, view: string): { category: string; diff: number } | null {
  const entries = sortedMonthEntries(state);
  const activeIndex = entries.findIndex(([key]) => key === state.activeMonth);
  if (activeIndex <= 0) return null;
  const previous = entries[activeIndex - 1][1];
  const current = state.months[state.activeMonth];
  const currentTotals = Object.fromEntries(getCategoryTotals(current, view).map((i) => [i.category, i.total]));
  const previousTotals = Object.fromEntries(getCategoryTotals(previous, view).map((i) => [i.category, i.total]));
  return (
    categories
      .map((category) => ({ category, diff: (currentTotals[category] || 0) - (previousTotals[category] || 0) }))
      .filter((item) => item.diff > 0)
      .sort((a, b) => b.diff - a.diff)[0] || null
  );
}

export function profileId(name: string): string {
  return (
    name
      .trim()
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "perfil"
  );
}
