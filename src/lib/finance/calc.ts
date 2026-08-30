// Pure formatting + calculation helpers. No side effects — safe for SSR.
import {
  DEFAULT_FAMILY_PEOPLE,
  VIEW_ALL,
  VIEW_ME,
  VIEW_SPOUSE,
  RESPONSAVEL_CASAL,
  categories,
} from "./constants";
import type { Expense, FinanceState, ImportSummary, MonthData, Priority } from "./types";

export function money(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Masks every "R$ ..." amount in free-form text — used for AI/local-fallback chat replies when values are hidden. */
export function maskMoneyInText(text: string): string {
  return text.replace(/R\$\s?-?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/g, "R$ ••••");
}

const BRL_IN_TEXT = /R\$\s?(-?)(\d[\d.,]*\d|\d)/g;

/**
 * Splits a raw "R$"-prefixed digit run (already known to be a plain number, no
 * "R$"/sign) into integer/decimal digit strings, pure string ops only — no
 * Number()/parseFloat, so a value too large for a float (or one where 1234.10
 * would lose its trailing zero) never gets touched by binary-float rounding.
 * Comma is always the decimal separator when present (any dots before it are
 * thousands grouping to discard); with no comma, a lone trailing ".NN" is
 * treated as the decimal part (the shape the backend's Money/BigDecimal
 * plain-string values come in, e.g. "6800.00") — anything else is grouping-only.
 */
function splitBrlDigits(raw: string): { integer: string; decimal: string } {
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let integer: string;
  let decimal: string;

  if (lastComma !== -1) {
    integer = raw.slice(0, lastComma).replace(/[.,]/g, "");
    decimal = raw.slice(lastComma + 1).replace(/\D/g, "");
  } else if (lastDot !== -1 && raw.length - lastDot - 1 === 2) {
    integer = raw.slice(0, lastDot).replace(/[.,]/g, "");
    decimal = raw.slice(lastDot + 1);
  } else if (lastDot !== -1) {
    integer = raw.replace(/[.,]/g, "");
    decimal = "";
  } else {
    integer = raw;
    decimal = "";
  }

  integer = integer.replace(/^0+(?=\d)/, "") || "0";
  decimal = (decimal + "00").slice(0, 2);
  return { integer, decimal };
}

/** Groups digits with a "." every 3 places from the right — e.g. "6800" -> "6.800". */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Deterministically reformats every "R$"-led amount in free-form text to pt-BR
 * (dot thousands, comma decimal, one space after "R$") — used on the
 * Assistant's answer because the LLM (see askGemini/sendAssistantMessage)
 * generates that text itself from a plain decimal string the backend tool
 * returns (e.g. "6800.00", see FinancialSummaryResponse's Money-as-string
 * contract) and isn't reliably consistent about pt-BR punctuation. Idempotent:
 * an already-correct "R$ 6.800,00" round-trips unchanged. Only touches
 * sequences immediately preceded by "R$" — years, percentages, installment
 * counts, dates, and UUIDs never match this pattern and pass through untouched.
 */
export function normalizeMoneyInText(text: string): string {
  return text.replace(BRL_IN_TEXT, (_match, sign: string, raw: string) => {
    const { integer, decimal } = splitBrlDigits(raw);
    return `R$ ${sign}${groupThousands(integer)},${decimal}`;
  });
}

/** Compact currency for tight chart labels, e.g. R$ 1,2 mil. */
export function moneyShort(value: number): string {
  const v = Number(value || 0);
  if (Math.abs(v) >= 1000)
    return `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return money(v);
}

export function formatDate(value?: string): string {
  if (!value) return "--";
  const [year, monthNumber, day] = value.split("-");
  return `${day}/${monthNumber}/${year}`;
}

export function categoryLabel(category: string): string {
  return category;
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

/**
 * Resolves a view (VIEW_ME/VIEW_SPOUSE/a person's name) to the owner value stored on
 * expenses/priorities. Must use the household's *current* member names — not the
 * hardcoded "Minha casa"/"Outra casa" placeholders — because Supabase sync matches
 * owners by the real profile name; a stale placeholder silently falls back to the
 * first profile once synced (see supabaseRepository.ts syncExpenses).
 */
export function resolveViewOwner(view: string, people?: string[]): string | null {
  if (view === VIEW_ME) return people?.[0] || currentUserName();
  if (view === VIEW_SPOUSE) return people?.[1] || spouseName();
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
  if (view === VIEW_ALL) return "Minha casa";
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
  if (["Esposa", "Pessoa 2", "Pai da namorada", "Outra casa"].includes(responsavel))
    return VIEW_SPOUSE;
  if (responsavel === VIEW_ME || responsavel === currentUserName()) return VIEW_ME;
  if (responsavel === VIEW_SPOUSE || responsavel === spouseName()) return VIEW_SPOUSE;
  return responsavel;
}

export function expenseMatchesView(expense: Expense, view: string, people?: string[]): boolean {
  const owner = resolveViewOwner(view, people);
  if (!owner) return true;
  return expense.owner === owner;
}

export function priorityMatchesView(priority: Priority, view: string, people?: string[]): boolean {
  const owner = resolveViewOwner(view, people);
  const responsible = priority.responsavel || people?.[0] || currentUserName();
  if (!owner) return true;
  return responsible === owner;
}

export function expensesForView(monthData: MonthData, view: string, people?: string[]): Expense[] {
  return (monthData.expenses || []).filter((item) => expenseMatchesView(item, view, people));
}

export function budgetForView(monthData: MonthData, view: string): number {
  if (view === VIEW_ALL)
    return Number(monthData.income || 0) + Number(monthData.houseContribution || 0);
  if (view === VIEW_SPOUSE) return Number(monthData.houseContribution || 0);
  if (view !== VIEW_ME) return Number(monthData.profileBudgets?.[view] || 0);
  return Number(monthData.income || 0);
}

export interface CategoryTotal {
  category: string;
  total: number;
}

export function getCategoryTotals(
  monthData: MonthData,
  view: string,
  people?: string[],
): CategoryTotal[] {
  const expenses = expensesForView(monthData, view, people).filter(
    (item) => item.type !== "income",
  );
  return categories
    .map((category) => ({
      category,
      total: sum(expenses.filter((item) => item.category === category)),
    }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total);
}

export interface Metrics {
  total: number;
  received: number;
  pending: number;
  paid: number;
  free: number;
  saving: number;
  topCategory?: CategoryTotal;
  paidRate: number;
  daysLeft: number;
  budget: number;
}

/** Days left in `monthKey` relative to today; a past month has 0 left, a future month is fully ahead. */
export function daysLeftInMonth(monthKey?: string): number {
  const now = new Date();
  const currentKey = currentCalendarMonthKey();
  if (!monthKey || monthKey === currentKey) {
    return Math.max(
      1,
      new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1,
    );
  }
  const [year, monthNumber] = monthKey.split("-").map(Number);
  if (monthKey < currentKey) return 0;
  return new Date(year, monthNumber, 0).getDate();
}

export function calc(
  monthData: MonthData,
  view: string,
  monthKey?: string,
  people?: string[],
): Metrics {
  const entries = expensesForView(monthData, view, people);
  const expenses = entries.filter((item) => item.type !== "income");
  const received = sum(entries.filter((item) => item.type === "income"));
  const budget = budgetForView(monthData, view);
  const total = sum(expenses);
  const pending = sum(expenses.filter((item) => item.status === "A pagar"));
  const paid = sum(expenses.filter((item) => item.status === "Pago"));
  const free = budget - total;
  const saving = Math.max(0, budget - paid);
  const byCategory = getCategoryTotals(monthData, view, people);
  const topCategory = byCategory[0];
  const daysLeft = daysLeftInMonth(monthKey);
  return {
    total,
    received,
    pending,
    paid,
    free,
    saving,
    topCategory,
    paidRate: total ? paid / total : 0,
    daysLeft,
    budget,
  };
}

export function expenseCompetence(expense: Expense): string {
  return /^\d{4}-\d{2}$/.test(expense.competence || "")
    ? expense.competence!
    : expense.date.slice(0, 7);
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
  const previous = entries
    .filter(([key]) => key < currentKey)
    .sort(([a], [b]) => b.localeCompare(a));
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

export function getLargestCategoryGrowth(
  state: FinanceState,
  view: string,
): { category: string; diff: number } | null {
  const entries = sortedMonthEntries(state);
  const activeIndex = entries.findIndex(([key]) => key === state.activeMonth);
  if (activeIndex <= 0) return null;
  const previous = entries[activeIndex - 1][1];
  const current = state.months[state.activeMonth];
  const currentTotals = Object.fromEntries(
    getCategoryTotals(current, view, state.people).map((i) => [i.category, i.total]),
  );
  const previousTotals = Object.fromEntries(
    getCategoryTotals(previous, view, state.people).map((i) => [i.category, i.total]),
  );
  return (
    categories
      .map((category) => ({
        category,
        diff: (currentTotals[category] || 0) - (previousTotals[category] || 0),
      }))
      .filter((item) => item.diff > 0)
      .sort((a, b) => b.diff - a.diff)[0] || null
  );
}

export interface NextDueExpense {
  expense: Expense;
  /** Negative = overdue, 0 = due today, positive = days remaining. */
  daysUntil: number;
}

/** Earliest unpaid item due (by dueDate, falling back to date), or null if nothing is pending. */
export function getNextDueExpense(expenses: Expense[]): NextDueExpense | null {
  const nextDue = expenses
    .filter((item) => item.status === "A pagar")
    .sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date))[0];
  if (!nextDue) return null;
  const today = new Date().toISOString().slice(0, 10);
  const daysUntil = Math.ceil(
    (new Date(nextDue.dueDate || nextDue.date).getTime() - new Date(today).getTime()) / 86400000,
  );
  return { expense: nextDue, daysUntil };
}

/**
 * One-sentence "how's my month going" headline. Same picking order (over
 * budget > bill due soon > category growth > weekly allowance) the Aval
 * chat's hero card already uses — shared here (P0-FRONTEND-1B.3) so the
 * Painel can show the same "what needs attention" line without a second,
 * possibly-diverging copy of this logic.
 */
export function getMonthHeadline(
  numbers: Metrics,
  expenses: Expense[],
  growth: { category: string; diff: number } | null,
  formatMoney: (value: number) => string,
): string {
  if (numbers.free < 0) {
    return `O orçamento passou ${formatMoney(Math.abs(numbers.free))}. Priorize cortar novas compras.`;
  }
  const next = getNextDueExpense(expenses);
  if (next && next.daysUntil <= 3) {
    return `${next.expense.name} ${
      next.daysUntil < 0
        ? "está atrasada"
        : next.daysUntil === 0
          ? "vence hoje"
          : `vence em ${next.daysUntil} dia${next.daysUntil === 1 ? "" : "s"}`
    }.`;
  }
  if (growth) {
    return `${categoryLabel(growth.category)} cresceu ${formatMoney(growth.diff)} contra o mês anterior.`;
  }
  const weeklyAllowance =
    numbers.daysLeft > 0 ? Math.max(0, (numbers.free / numbers.daysLeft) * 7) : 0;
  return `Você pode gastar cerca de ${formatMoney(weeklyAllowance)} nesta semana.`;
}

/** Lowercases and strips accents so text can be matched regardless of typing style. */
export function normalizeText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Builds the toast text for a finished import — see FinanceContext.importData/ImportSummary. */
export function summarizeImport(summary: ImportSummary): string {
  const total = summary.importedExpenses + summary.importedPriorities;
  const parts: string[] = [
    total === 0
      ? summary.duplicates > 0
        ? "Todos os lançamentos deste arquivo já estavam importados."
        : "Nenhum lançamento novo foi adicionado."
      : total === 1
        ? "Importação concluída. 1 lançamento adicionado."
        : `Importação concluída. ${total} lançamentos adicionados.`,
  ];
  if (summary.skipped.length > 0) {
    const names = [...new Set(summary.skipped.map((row) => row.ownerRaw))];
    parts.push(
      summary.skipped.length === 1
        ? `1 lançamento não foi importado por responsável desconhecido (${names.join(", ")}).`
        : `${summary.skipped.length} lançamentos não foram importados por responsável desconhecido (${names.join(", ")}).`,
    );
  }
  return parts.join(" ");
}

export function profileId(name: string): string {
  return (
    normalizeText(name)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "perfil"
  );
}
