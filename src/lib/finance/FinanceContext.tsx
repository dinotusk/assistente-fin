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
import { VIEW_ME, VIEW_SPOUSE } from "./constants";
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
import {
  currentUserName,
  formatMonthLabel,
  getNextMonthKey,
  spouseName,
} from "./calc";

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
  savePeople: (personOne: string, personTwo: string) => void;
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
      if (![VIEW_ME, VIEW_SPOUSE].includes(view)) return;
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
    (personOne: string, personTwo: string) => {
      const oldPeople = [...state.people];
      const newPeople = [personOne.trim(), personTwo.trim()];
      const months = { ...state.months };
      Object.keys(months).forEach((key) => {
        const data = months[key];
        data.expenses = data.expenses.map((expense) => {
          let owner = expense.owner;
          if ([oldPeople[0], newPeople[0], "Meu perfil", "Pessoa 1"].includes(owner)) owner = currentUserName();
          if ([oldPeople[1], newPeople[1], "Esposa", "Pessoa 2"].includes(owner)) owner = spouseName();
          return { ...expense, owner };
        });
      });
      persist({ ...state, months, people: [currentUserName(), spouseName()] });
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
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const imported = JSON.parse(String(reader.result));
            if (!imported.months || !Array.isArray(imported.people)) throw new Error("Formato inválido");
            const next = migrateState(imported, activeUser?.name);
            persist(next);
            resolve();
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
        reader.readAsText(file);
      }),
    [persist, activeUser],
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
