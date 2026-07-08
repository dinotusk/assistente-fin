import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { profileId } from "./calc";
import { categories, paymentMethods, VIEW_ALL, VIEW_ME, VIEW_SPOUSE } from "./constants";
import { createSeedState, uid } from "./seed";
import {
  getProfiles,
  loadActiveUser,
  loadState,
  localLogin,
  migrateState,
  saveProfiles,
  saveState,
  setActiveUser as persistActiveUser,
} from "./storage";
import type {
  ActiveUser,
  Expense,
  FinanceState,
  MonthData,
  Priority,
} from "./types";
import { currentUserName, formatMonthLabel, getNextMonthKey, spouseName } from "./calc";

interface FinanceContextValue {
  ready: boolean;
  activeUser: ActiveUser | null;
  state: FinanceState;
  month: MonthData;
  login: (name: string, pin: string) => Promise<ActiveUser>;
  logout: () => void;
  setActiveMonth: (key: string) => void;
  setActivePerson: (view: string) => void;
  createNextMonth: () => string;
  saveMonthSettings: (label: string, income: number, houseContribution: number) => void;
  savePeople: (people: string[]) => void;
  saveExpense: (expense: Expense, id?: string) => void;
  deleteExpense: (id: string) => void;
  duplicateExpense: (id: string) => void;
  toggleExpenseStatus: (id: string) => void;
  savePriority: (priority: Priority, id?: string) => void;
  deletePriority: (id: string) => void;
  togglePriorityStatus: (id: string) => void;
  exportData: () => void;
  importData: (file: File) => Promise<void>;
  resetSeed: () => void;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [activeUser, setActiveUserState] = useState<ActiveUser | null>(null);
  const [state, setState] = useState<FinanceState>(() => migrateState(createSeedState()));

  // Hydrate from localStorage on the client only (avoids SSR mismatch).
  useEffect(() => {
    const user = loadActiveUser();
    setActiveUserState(user);
    setState(loadState(user));
    setReady(true);
  }, []);

  const persist = useCallback(
    (next: FinanceState, user: ActiveUser | null = activeUser) => {
      saveState(next, user);
      setState({ ...next });
    },
    [activeUser],
  );

  const month = useMemo(() => state.months[state.activeMonth], [state]);

  const login = useCallback(async (name: string, pin: string): Promise<ActiveUser> => {
    const usuario = localLogin(name, pin);
    const profile = { id: usuario.id, name: usuario.name, pin };
    const profiles = getProfiles();
    const existingIndex = profiles.findIndex((item) => item.id === profile.id);
    if (existingIndex >= 0) profiles[existingIndex] = { ...profiles[existingIndex], ...profile };
    else profiles.push(profile);
    saveProfiles(profiles);

    const user: ActiveUser = { id: profile.id, name: profile.name };
    persistActiveUser(user);
    const loaded = loadState(user);
    saveState(loaded, user);
    setActiveUserState(user);
    setState(loaded);
    return user;
  }, []);

  const logout = useCallback(() => {
    saveState(state, activeUser);
    persistActiveUser(null);
    setActiveUserState(null);
  }, [state, activeUser]);

  const setActiveMonth = useCallback(
    (key: string) => {
      if (!state.months[key]) return;
      persist({ ...state, activeMonth: key });
    },
    [state, persist],
  );

  const setActivePerson = useCallback(
    (view: string) => {
      if (![VIEW_ALL, VIEW_ME, VIEW_SPOUSE, ...state.people].includes(view)) return;
      persist({ ...state, activePerson: view });
    },
    [state, persist],
  );

  const createNextMonth = useCallback((): string => {
    const nextKey = getNextMonthKey(state.activeMonth);
    if (state.months[nextKey]) {
      persist({ ...state, activeMonth: nextKey });
      return nextKey;
    }
    const current = state.months[state.activeMonth];
    const next: MonthData = {
      label: formatMonthLabel(nextKey),
      income: current.income,
      houseContribution: current.houseContribution,
      expenses: current.expenses.map((item) => ({
        ...item,
        id: uid(),
        status: "A pagar",
        date: `${nextKey}-${(item.date || "2025-07-05").slice(8, 10) || "05"}`,
      })),
      priorities: current.priorities.map((item) => ({ ...item, id: uid(), status: "A pagar" })),
    };
    persist({ ...state, months: { ...state.months, [nextKey]: next }, activeMonth: nextKey });
    return nextKey;
  }, [state, persist]);

  const saveMonthSettings = useCallback(
    (label: string, income: number, houseContribution: number) => {
      const updated: MonthData = { ...month, label: label.trim(), income, houseContribution };
      persist({ ...state, months: { ...state.months, [state.activeMonth]: updated } });
    },
    [state, month, persist],
  );

  const savePeople = useCallback(
    (people: string[]) => {
      const clean = people
        .map((person) => person.trim())
        .filter(Boolean)
        .filter((person, index, list) => list.findIndex((item) => item.toLocaleLowerCase("pt-BR") === person.toLocaleLowerCase("pt-BR")) === index);
      const newPeople = clean.length ? clean : [currentUserName()];
      const activePerson = [VIEW_ALL, VIEW_ME, VIEW_SPOUSE, ...newPeople].includes(state.activePerson)
        ? state.activePerson
        : VIEW_ME;
      persist({ ...state, people: newPeople, activePerson });
    },
    [state, persist],
  );

  const updateMonthExpenses = useCallback(
    (updater: (expenses: Expense[]) => Expense[]) => {
      const updated: MonthData = { ...month, expenses: updater(month.expenses) };
      persist({ ...state, months: { ...state.months, [state.activeMonth]: updated } });
    },
    [state, month, persist],
  );

  const saveExpense = useCallback(
    (expense: Expense, id?: string) => {
      updateMonthExpenses((list) =>
        id ? list.map((item) => (item.id === id ? expense : item)) : [...list, expense],
      );
    },
    [updateMonthExpenses],
  );

  const deleteExpense = useCallback(
    (id: string) => updateMonthExpenses((list) => list.filter((item) => item.id !== id)),
    [updateMonthExpenses],
  );

  const duplicateExpense = useCallback(
    (id: string) =>
      updateMonthExpenses((list) => {
        const item = list.find((e) => e.id === id);
        if (!item) return list;
        return [...list, { ...item, id: uid(), name: `${item.name} (cópia)`, status: "A pagar" }];
      }),
    [updateMonthExpenses],
  );

  const toggleExpenseStatus = useCallback(
    (id: string) =>
      updateMonthExpenses((list) =>
        list.map((item) =>
          item.id === id ? { ...item, status: item.status === "Pago" ? "A pagar" : "Pago" } : item,
        ),
      ),
    [updateMonthExpenses],
  );

  const updateMonthPriorities = useCallback(
    (updater: (priorities: Priority[]) => Priority[]) => {
      const updated: MonthData = { ...month, priorities: updater(month.priorities) };
      persist({ ...state, months: { ...state.months, [state.activeMonth]: updated } });
    },
    [state, month, persist],
  );

  const savePriority = useCallback(
    (priority: Priority, id?: string) => {
      updateMonthPriorities((list) =>
        id ? list.map((item) => (item.id === id ? priority : item)) : [...list, priority],
      );
    },
    [updateMonthPriorities],
  );

  const deletePriority = useCallback(
    (id: string) => updateMonthPriorities((list) => list.filter((item) => item.id !== id)),
    [updateMonthPriorities],
  );

  const togglePriorityStatus = useCallback(
    (id: string) =>
      updateMonthPriorities((list) =>
        list.map((item) => {
          if (item.id !== id) return item;
          const status =
            item.status === "Pago" ? "A pagar" : item.status === "A pagar" ? "Adiar" : "Pago";
          return { ...item, status };
        }),
      ),
    [updateMonthPriorities],
  );

  const exportData = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `assistente-financeiro-${state.activeMonth}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const importData = useCallback(
    (file: File) =>
      new Promise<void>((resolve, reject) => {
        const extension = file.name.split(".").pop()?.toLowerCase();
        if (["xls", "xlsx"].includes(extension || "")) {
          importSpreadsheet(file, state)
            .then((next) => {
              persist(next);
              resolve();
            })
            .catch(reject);
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          try {
            const imported = JSON.parse(String(reader.result));
            const next = importJsonPayload(imported, state, activeUser?.name);
            persist(next);
            resolve();
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
        reader.readAsText(file);
      }),
    [persist, activeUser, state],
  );

  const resetSeed = useCallback(() => {
    persist(migrateState(createSeedState(), activeUser?.name));
  }, [persist, activeUser]);

  const value: FinanceContextValue = {
    ready,
    activeUser,
    state,
    month,
    login,
    logout,
    setActiveMonth,
    setActivePerson,
    createNextMonth,
    saveMonthSettings,
    savePeople,
    saveExpense,
    deleteExpense,
    duplicateExpense,
    toggleExpenseStatus,
    savePriority,
    deletePriority,
    togglePriorityStatus,
    exportData,
    importData,
    resetSeed,
  };

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance(): FinanceContextValue {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance must be used within FinanceProvider");
  return ctx;
}

export { profileId };

async function importSpreadsheet(file: File, state: FinanceState): Promise<FinanceState> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const months = { ...state.months };
  let imported = 0;
  let importedPriorities = 0;

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    const monthKey = monthKeyFromSheetName(sheetName, state.activeMonth) || state.activeMonth;
    const current = months[monthKey] || {
      label: formatMonthLabel(monthKey),
      income: 0,
      houseContribution: 0,
      expenses: [],
      priorities: [],
    };
    const parsed = extractFinanceFromRows(rows, monthKey);
    if (!parsed.expenses.length && !parsed.priorities.length && !parsed.income) return;
    imported += parsed.expenses.length;
    importedPriorities += parsed.priorities.length;
    months[monthKey] = {
      ...current,
      income: parsed.income || current.income,
      expenses: dedupeExpenses([...current.expenses, ...parsed.expenses]),
      priorities: dedupePriorities([...current.priorities, ...parsed.priorities]),
    };
  });

  if (!imported && !importedPriorities) throw new Error("Nenhum gasto encontrado na planilha");
  return migrateState({ ...state, months });
}

function extractExpensesFromRows(rows: unknown[][], monthKey: string): Expense[] {
  const expenses: Expense[] = [];
  rows.forEach((row, index) => {
    const headers = row.map((cell) => normalizeHeader(cell));
    const itemIndex = findIndex(headers, ["item", "descricao", "descrição", "gasto", "nome"]);
    const valueIndex = findIndex(headers, ["valor", "amount", "preco", "preço"]);
    if (itemIndex < 0 || valueIndex < 0) return;

    const categoryIndex = findIndex(headers, ["categoria"]);
    const statusIndex = findIndex(headers, ["status", "situacao", "situação"]);
    const ownerIndex = findIndex(headers, ["responsavel", "responsável", "pessoa", "owner"]);
    const dateIndex = findIndex(headers, ["data", "vencimento"]);
    const paymentIndex = findIndex(headers, ["forma", "pagamento", "forma de pagamento"]);
    const noteIndex = findIndex(headers, ["observacao", "observação", "negociar", "nota"]);

    rows.slice(index + 1).forEach((dataRow) => {
      const name = String(dataRow[itemIndex] || "").trim();
      const amount = parseSheetAmount(dataRow[valueIndex]);
      if (!name || !amount || /^total$/i.test(name)) return;

      expenses.push({
        id: uid(),
        name,
        category: normalizeCategory(String(dataRow[categoryIndex] || "")),
        amount,
        status: String(dataRow[statusIndex] || "").toLowerCase().includes("pag")
          && !String(dataRow[statusIndex] || "").toLowerCase().includes("pago")
          ? "A pagar"
          : String(dataRow[statusIndex] || "").toLowerCase().includes("pago")
            ? "Pago"
            : "A pagar",
        owner: normalizeOwner(String(dataRow[ownerIndex] || "")),
        date: normalizeSheetDate(dataRow[dateIndex], monthKey),
        paymentMethod: normalizePayment(String(dataRow[paymentIndex] || "")),
        note: String(dataRow[noteIndex] || "").trim(),
        createdAt: new Date().toISOString(),
      });
    });
  });
  return dedupeExpenses(expenses);
}

function importJsonPayload(payload: unknown, state: FinanceState, loginName = ""): FinanceState {
  if (isFinanceBackup(payload)) return migrateState(payload, loginName);

  const months = { ...state.months };
  let imported = 0;
  collectJsonRows(payload).forEach((row) => {
    const expense = expenseFromRecord(row, state.activeMonth);
    if (!expense) return;
    const monthKey = monthKeyFromRecord(row, expense.date, state.activeMonth);
    const current = months[monthKey] || emptyMonth(monthKey);
    imported += 1;
    months[monthKey] = {
      ...current,
      expenses: dedupeExpenses([...current.expenses, expense]),
    };
  });

  if (!imported) throw new Error("Formato invalido ou nenhum gasto encontrado");
  return migrateState({ ...state, months }, loginName);
}

function isFinanceBackup(payload: unknown): payload is FinanceState {
  const data = payload as Partial<FinanceState>;
  return Boolean(data?.months && typeof data.months === "object" && Array.isArray(data.people));
}

function collectJsonRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  return [
    payload.gastos,
    payload.expenses,
    payload.despesas,
    payload.contas,
    payload.transactions,
    payload.items,
    payload.data,
  ].flatMap((group) => (Array.isArray(group) ? group.filter(isRecord) : []));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function emptyMonth(monthKey: string): MonthData {
  return {
    label: formatMonthLabel(monthKey),
    income: 0,
    houseContribution: 0,
    expenses: [],
    priorities: [],
  };
}

interface ParsedSheetData {
  expenses: Expense[];
  priorities: Priority[];
  income: number;
}

function extractFinanceFromRows(rows: unknown[][], monthKey: string): ParsedSheetData {
  const expenses: Expense[] = [];
  const priorities: Priority[] = [];
  let income = 0;

  rows.forEach((row, index) => {
    const headers = row.map((cell) => normalizeHeader(cell));
    const itemIndex = findIndex(headers, ["item", "descricao", "descrição", "gasto", "nome"]);
    const valueIndex = findIndex(headers, ["valor", "amount", "preco", "preço"]);
    if (itemIndex < 0 || valueIndex < 0) return;

    const categoryIndex = findIndex(headers, ["categoria"]);
    const statusIndex = findIndex(headers, ["status", "situacao", "situação"]);
    const priorityIndex = findIndex(headers, ["prioridade", "rank"]);
    const ownerIndex = findIndex(headers, ["responsavel", "responsável", "pessoa", "owner"]);
    const dateIndex = findIndex(headers, ["data", "vencimento"]);
    const paymentIndex = findIndex(headers, ["forma", "pagamento", "forma de pagamento"]);
    const noteIndex = findIndex(headers, ["observacao", "observação", "negociar", "nota"]);
    const context = contextTextForRow(rows, index);
    const isPriorityTable = context.includes("prioridade") || priorityIndex >= 0;
    const sectionOwner = ownerFromContext(context);
    const tableEnd = nextHeaderIndex(rows, index + 1);

    rows.slice(index + 1, tableEnd).forEach((dataRow) => {
      const name = String(dataRow[itemIndex] || "").trim();
      const amount = parseSheetAmount(dataRow[valueIndex]);
      if (!name || !amount || shouldIgnoreImportedName(name)) return;
      if (normalizeHeader(name) === "salario") {
        income = Math.max(income, amount);
        return;
      }

      if (isPriorityTable) {
        priorities.push({
          id: uid(),
          name,
          amount,
          rank: parsePriorityRank(dataRow[priorityIndex]),
          status: normalizePriorityStatus(String(dataRow[statusIndex] || "")),
          responsavel: normalizeOwner(String(dataRow[ownerIndex] || ""), sectionOwner),
          createdAt: new Date().toISOString(),
        });
        return;
      }

      expenses.push({
        id: uid(),
        name,
        category: normalizeCategory(String(dataRow[categoryIndex] || "")),
        amount,
        status: normalizeExpenseStatus(String(dataRow[statusIndex] || "")),
        owner: normalizeOwner(String(dataRow[ownerIndex] || ""), sectionOwner),
        date: normalizeSheetDate(dataRow[dateIndex], monthKey),
        paymentMethod: normalizePayment(String(dataRow[paymentIndex] || "")),
        note: String(dataRow[noteIndex] || "").trim(),
        createdAt: new Date().toISOString(),
      });
    });
  });

  return { expenses: dedupeExpenses(expenses), priorities: dedupePriorities(priorities), income };
}

function normalizeHeader(value: unknown): string {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function findIndex(headers: string[], names: string[]): number {
  return headers.findIndex((header) => names.some((name) => header === normalizeHeader(name) || header.includes(normalizeHeader(name))));
}

function parseSheetAmount(value: unknown): number {
  if (typeof value === "number") return Math.abs(value);
  const clean = String(value || "").replace(/[^\d,.-]/g, "");
  if (!clean) return 0;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  return Math.abs(Number(normalized || 0));
}

function normalizeCategory(value: string): string {
  const normalized = normalizeHeader(value);
  return categories.find((category) => normalizeHeader(category) === normalized) || "Outros";
}

function normalizeOwner(value: string, fallback = "Minha casa"): string {
  const normalized = normalizeHeader(value);
  if (!normalized) return fallback;
  if (normalized.includes("pai") || normalized.includes("namorada")) return "Pai da namorada";
  if (normalized.includes("minha") || normalized.includes("meus") || normalized.includes("junior")) return "Minha casa";
  return fallback;
}

function normalizePayment(value: string): string {
  const normalized = normalizeHeader(value);
  return paymentMethods.find((method) => normalizeHeader(method) === normalized) || "Pix";
}

function normalizeSheetDate(value: unknown, monthKey: string): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (match) {
    const [, d, m, y] = match;
    const year = y ? (y.length === 2 ? `20${y}` : y) : monthKey.slice(0, 4);
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return `${monthKey}-05`;
}

function monthKeyFromSheetName(sheetName: string, fallbackMonth = ""): string | null {
  const normalized = normalizeHeader(sheetName).replace(/\s+/g, "");
  const direct = normalized.match(/(20\d{2})[-_/]?(\d{1,2})/);
  if (direct) return `${direct[1]}-${direct[2].padStart(2, "0")}`;
  const months = [
    "janeiro",
    "fevereiro",
    "marco",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  const index = months.findIndex((month) => normalized.includes(month));
  const year = normalized.match(/20\d{2}/)?.[0] || fallbackMonth.slice(0, 4);
  if (index >= 0 && year) return `${year}-${String(index + 1).padStart(2, "0")}`;
  return null;
}

function expenseFromRecord(row: Record<string, unknown>, fallbackMonth: string): Expense | null {
  const name = stringFromRecord(row, ["descricao", "descrição", "description", "item", "nome", "gasto"]);
  const amount = parseSheetAmount(valueFromRecord(row, ["valor", "amount", "preco", "preço"]));
  if (!name || !amount || shouldIgnoreImportedName(name)) return null;
  const date = normalizeSheetDate(valueFromRecord(row, ["data", "date", "vencimento"]), fallbackMonth);
  return {
    id: String(valueFromRecord(row, ["id", "id_gasto"]) || uid()),
    name,
    category: normalizeCategory(stringFromRecord(row, ["categoria", "category", "tipo"])),
    amount,
    status: normalizeExpenseStatus(stringFromRecord(row, ["status", "situacao", "situação"])),
    owner: normalizeOwner(stringFromRecord(row, ["responsavel", "responsável", "owner", "pessoa", "nome_usuario"])),
    date,
    paymentMethod: normalizePayment(stringFromRecord(row, ["forma_pagamento", "forma de pagamento", "pagamento", "paymentMethod"])),
    note: stringFromRecord(row, ["observacao", "observação", "note", "nota", "negociar"]),
    createdAt: String(valueFromRecord(row, ["criado_em", "createdAt"]) || new Date().toISOString()),
  };
}

function valueFromRecord(row: Record<string, unknown>, names: string[]): unknown {
  const normalizedNames = names.map(normalizeHeader);
  return Object.entries(row).find(([key]) => normalizedNames.includes(normalizeHeader(key)))?.[1];
}

function stringFromRecord(row: Record<string, unknown>, names: string[]): string {
  return String(valueFromRecord(row, names) || "").trim();
}

function monthKeyFromRecord(row: Record<string, unknown>, date: string, fallbackMonth: string): string {
  const year = String(valueFromRecord(row, ["ano", "year"]) || "").replace(/\D/g, "");
  const month = String(valueFromRecord(row, ["mes", "mês", "month"]) || "").trim();
  const direct = monthKeyFromSheetName(`${month}${year}`, fallbackMonth);
  return direct || date.slice(0, 7) || fallbackMonth;
}

function contextTextForRow(rows: unknown[][], headerIndex: number): string {
  return rows
    .slice(Math.max(0, headerIndex - 5), headerIndex)
    .flat()
    .map((cell) => normalizeHeader(cell))
    .filter(Boolean)
    .join(" ");
}

function ownerFromContext(context: string): string {
  if (context.includes("meus itens")) return "Minha casa";
  if (context.includes("pai") || context.includes("namorada")) return "Pai da namorada";
  if (/\bcasa\b/.test(context)) return "Pai da namorada";
  return "Minha casa";
}

function nextHeaderIndex(rows: unknown[][], start: number): number {
  for (let index = start; index < rows.length; index += 1) {
    const headers = rows[index].map((cell) => normalizeHeader(cell));
    const hasItem = findIndex(headers, ["item", "descricao", "descrição", "gasto", "nome"]) >= 0;
    const hasValue = findIndex(headers, ["valor", "amount", "preco", "preço"]) >= 0;
    if (hasItem && hasValue) return index;
  }
  return rows.length;
}

function shouldIgnoreImportedName(name: string): boolean {
  const normalized = normalizeHeader(name);
  return !normalized || ["total", "valor", "item", "categoria"].includes(normalized);
}

function normalizeExpenseStatus(value: string): "Pago" | "A pagar" {
  const normalized = normalizeHeader(value);
  if (normalized.includes("pago")) return "Pago";
  return "A pagar";
}

function normalizePriorityStatus(value: string): Priority["status"] {
  const normalized = normalizeHeader(value);
  if (normalized.includes("pago")) return "Pago";
  if (normalized.includes("adiar")) return "Adiar";
  return "A pagar";
}

function parsePriorityRank(value: unknown): number {
  const rank = Number(String(value || "").replace(/\D/g, ""));
  return rank >= 1 && rank <= 3 ? rank : 2;
}

function dedupeExpenses(expenses: Expense[]): Expense[] {
  const seen = new Set<string>();
  return expenses.filter((expense) => {
    const key = `${expense.name}|${expense.amount}|${expense.date}|${expense.owner}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupePriorities(priorities: Priority[]): Priority[] {
  const seen = new Set<string>();
  return priorities.filter((priority) => {
    const key = `${priority.name}|${priority.amount}|${priority.responsavel}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
