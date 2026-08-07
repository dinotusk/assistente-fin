import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { money, moneyShort, profileId } from "./calc";
import {
  categories,
  defaultEnvelopeRules,
  paymentMethods,
  VIEW_ALL,
  VIEW_ME,
  VIEW_SPOUSE,
} from "./constants";
import { lookupLearnedCategory } from "./learnedCategories";
import { createSeedState, uid } from "./seed";
import { createSyncQueue, type SyncQueue } from "./syncQueue";
import {
  createHouseholdInvite,
  getAiConsentStatus,
  getAuthenticatedUser,
  loadRemoteFinance,
  loginWithGoogle as loginWithGoogleSupabase,
  loginWithSupabase,
  logoutFromSupabase,
  redeemInvite,
  hasPushSubscription,
  registerWithSupabase,
  removePushSubscription,
  revokeAiConsent,
  saveAiConsent,
  savePushSubscription,
  saveRemoteEnvelopes,
  saveRemoteFinance,
  saveSessionPreference,
  type AiConsentStatus,
  type PushSubscriptionKeys,
  type FinanceWorkspace,
} from "./supabaseRepository";
import { migrateState } from "./storage";
import type { ActiveUser, EnvelopeRule, Expense, FinanceState, MonthData, Priority } from "./types";
import { currentUserName, formatMonthLabel, getNextMonthKey, spouseName } from "./calc";
import { classifySyncError, type WriteConflict } from "./writeConflict";

interface FinanceContextValue {
  ready: boolean;
  authError: string | null;
  retryAuth: () => void;
  hideValues: boolean;
  toggleHideValues: () => void;
  activeUser: ActiveUser | null;
  state: FinanceState;
  month: MonthData;
  envelopes: EnvelopeRule[];
  login: (name: string, email: string, password: string) => Promise<ActiveUser>;
  register: (
    name: string,
    email: string,
    password: string,
    inviteCode?: string,
  ) => Promise<ActiveUser>;
  loginWithGoogle: () => Promise<void>;
  logout: () => void;
  createInvite: () => Promise<string>;
  joinHousehold: (code: string) => Promise<void>;
  savePushSubscription: (subscription: PushSubscriptionKeys) => Promise<void>;
  removePushSubscription: (endpoint: string) => Promise<void>;
  hasPushSubscription: (endpoint: string) => Promise<boolean>;
  saveAiConsent: () => Promise<void>;
  revokeAiConsent: () => Promise<void>;
  getAiConsentStatus: () => Promise<AiConsentStatus>;
  setActiveMonth: (key: string) => void;
  setActivePerson: (view: string) => void;
  createNextMonth: () => string;
  saveMonthSettings: (
    label: string,
    income: number,
    houseContribution: number,
    profileBudgets?: Record<string, number>,
    planned?: boolean,
  ) => void;
  deleteMonth: (key: string) => void;
  savePeople: (people: string[]) => void;
  saveExpense: (expense: Expense, id?: string) => void;
  importExpenses: (expenses: Expense[]) => void;
  deleteExpense: (id: string) => void;
  duplicateExpense: (id: string) => void;
  toggleExpenseStatus: (id: string) => void;
  savePriority: (priority: Priority, id?: string) => void;
  deletePriority: (id: string) => void;
  togglePriorityStatus: (id: string) => void;
  saveEnvelopes: (envelopes: EnvelopeRule[]) => void;
  exportData: () => void;
  importData: (file: File) => Promise<void>;
  resetSeed: () => void;
  /** Set when the last sync failed because a row changed/vanished under us (see WriteNotAppliedError). Null otherwise. */
  writeConflict: WriteConflict | null;
  /** Reloads remote state only (no page reload, no re-login) and clears writeConflict. The failed local edit is discarded. */
  refreshAfterConflict: () => Promise<void>;
  /** Closes the conflict dialog without reloading — the stale local edit stays as-is until the user acts again. */
  dismissWriteConflict: () => void;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [hideValues, setHideValues] = useState(false);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [activeUser, setActiveUserState] = useState<ActiveUser | null>(null);
  const [state, setState] = useState<FinanceState>(() => createEmptyState());
  const [envelopes, setEnvelopes] = useState<EnvelopeRule[]>(defaultEnvelopeRules);
  const [writeConflict, setWriteConflict] = useState<WriteConflict | null>(null);
  const workspaceRef = useRef<FinanceWorkspace | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  /** State as of the last *confirmed* remote write, used as the diff base — only advances on success. */
  const previousStateRef = useRef<FinanceState>(createEmptyState());
  const financeSyncPendingRef = useRef<Promise<void>>(Promise.resolve());
  const syncQueueRef = useRef<SyncQueue<FinanceState, FinanceWorkspace> | null>(null);
  if (!syncQueueRef.current) {
    syncQueueRef.current = createSyncQueue<FinanceState, FinanceWorkspace>({
      getWorkspace: () => workspaceRef.current,
      setWorkspace: (workspace) => {
        workspaceRef.current = workspace;
      },
      getConfirmed: () => previousStateRef.current,
      setConfirmed: (nextState) => {
        previousStateRef.current = nextState;
      },
      write: (workspace, base, next) => saveRemoteFinance(workspace, base, next),
      onError: (error) => {
        console.error("Falha ao sincronizar dados financeiros", error);
        const conflict = classifySyncError(error);
        if (conflict) {
          // A dedicated dialog handles this case (see ConflictDialog) — no
          // generic toast, no stack trace, no technical message shown here.
          setWriteConflict(conflict);
          return;
        }
        toast.error(
          "Não foi possível salvar sua última alteração. Verifique sua conexão e tente de novo.",
        );
      },
    });
  }

  useEffect(() => {
    let mounted = true;
    setReady(false);
    setAuthError(null);
    getAuthenticatedUser()
      .then(async (user) => {
        if (!user || !mounted) return;
        const loaded = await loadRemoteFinance(user);
        if (!mounted) return;
        workspaceRef.current = loaded.workspace;
        previousStateRef.current = loaded.state;
        setActiveUserState(loaded.user);
        setState(loaded.state);
        if (loaded.envelopes.length) {
          setEnvelopes(loaded.envelopes);
        } else {
          const saved = await saveRemoteEnvelopes(
            loaded.workspace.householdId,
            defaultEnvelopeRules,
          );
          if (mounted) setEnvelopes(saved);
        }
      })
      .catch((error) => {
        console.error("Falha ao carregar dados do Supabase", error);
        if (mounted) {
          setAuthError(
            error instanceof Error
              ? error.message
              : "Não foi possível conectar. Verifique sua internet.",
          );
        }
      })
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, [bootAttempt]);

  const retryAuth = useCallback(() => setBootAttempt((attempt) => attempt + 1), []);

  const toggleHideValues = useCallback(() => setHideValues((value) => !value), []);

  const persist = useCallback((next: FinanceState) => {
    setState({ ...next });
    if (!workspaceRef.current || !syncQueueRef.current) return;
    financeSyncPendingRef.current = syncQueueRef.current.push(next);
  }, []);

  const month = useMemo(
    () => state.months[state.activeMonth] || createEmptyMonth(state.activeMonth),
    [state],
  );

  const hydrateAuthenticatedUser = useCallback(async (): Promise<ActiveUser> => {
    const authenticated = await getAuthenticatedUser();
    if (!authenticated) throw new Error("Sessao nao encontrada.");
    const loaded = await loadRemoteFinance(authenticated);
    workspaceRef.current = loaded.workspace;
    previousStateRef.current = loaded.state;
    setActiveUserState(loaded.user);
    setState(loaded.state);
    if (loaded.envelopes.length) {
      setEnvelopes(loaded.envelopes);
    } else {
      setEnvelopes(await saveRemoteEnvelopes(loaded.workspace.householdId, defaultEnvelopeRules));
    }
    return loaded.user;
  }, []);

  /**
   * "Atualizar dados" in the conflict dialog. Reloads remote state only —
   * same mechanism login/register/joinHousehold already use, so no page
   * reload, no re-login, no touching local UI state (filters, open dialogs,
   * hideValues) that lives outside FinanceContext. The optimistic edit that
   * conflicted was never confirmed, so replacing `state` with the fresh
   * server copy is what discards it.
   *
   * KNOWN RISK (checked, not fixed — see P0-02B review): persist() never
   * blocks the UI, and syncQueue.push() only serializes *execution* (one
   * write in flight at a time) — it does not cap how many pushes can be
   * queued waiting their turn. So a second edit made anywhere in the app
   * while the first save is still in flight is a real, already-possible
   * sequence (e.g. edit expense A, immediately edit expense B before A's
   * network round trip finishes) — see syncQueue.test.ts's "keeps the
   * confirmed base after a failed write" test, which already demonstrates a
   * second push executing right after a failed first one, independent of
   * anything the UI does. If write A fails and shows this dialog while
   * write B is still queued/in flight, clicking "Atualizar dados" replaces
   * workspaceRef/previousStateRef with a fresh server copy, and write B's
   * completion (moments later) overwrites those same refs again with data
   * that predates the refresh. This cannot silently corrupt Postgres data —
   * P0-02A's version check still guards every write — but it can leave the
   * *local* bookkeeping refs briefly stale, which can surface as a spurious
   * extra conflict on the next save rather than true data loss. Not fixed
   * here per explicit scope (no new architecture without confirming this
   * first) — see PR discussion for the full analysis.
   */
  const refreshAfterConflict = useCallback(async (): Promise<void> => {
    await hydrateAuthenticatedUser();
    setWriteConflict(null);
  }, [hydrateAuthenticatedUser]);

  /** "Fechar" in the conflict dialog — just hides it. No reload, no retry: the stale local edit is left exactly as it was. */
  const dismissWriteConflict = useCallback(() => setWriteConflict(null), []);

  const login = useCallback(
    async (name: string, email: string, password: string): Promise<ActiveUser> => {
      await loginWithSupabase({ name, email, password });
      return hydrateAuthenticatedUser();
    },
    [hydrateAuthenticatedUser],
  );

  const register = useCallback(
    async (
      name: string,
      email: string,
      password: string,
      inviteCode?: string,
    ): Promise<ActiveUser> => {
      await registerWithSupabase({ name, email, password }, inviteCode);
      return hydrateAuthenticatedUser();
    },
    [hydrateAuthenticatedUser],
  );

  const createInvite = useCallback((): Promise<string> => createHouseholdInvite(), []);

  const joinHousehold = useCallback(
    async (code: string): Promise<void> => {
      if (!activeUser) throw new Error("Sessao nao encontrada.");
      await redeemInvite(code, activeUser.name);
      await hydrateAuthenticatedUser();
    },
    [activeUser, hydrateAuthenticatedUser],
  );

  const loginWithGoogle = useCallback((): Promise<void> => loginWithGoogleSupabase(), []);

  const savePushSubscriptionAction = useCallback(
    (subscription: PushSubscriptionKeys): Promise<void> => savePushSubscription(subscription),
    [],
  );

  const removePushSubscriptionAction = useCallback(
    (endpoint: string): Promise<void> => removePushSubscription(endpoint),
    [],
  );

  const hasPushSubscriptionAction = useCallback(
    (endpoint: string): Promise<boolean> => hasPushSubscription(endpoint),
    [],
  );

  const saveAiConsentAction = useCallback((): Promise<void> => saveAiConsent(), []);
  const revokeAiConsentAction = useCallback((): Promise<void> => revokeAiConsent(), []);
  const getAiConsentStatusAction = useCallback(
    (): Promise<AiConsentStatus> => getAiConsentStatus(),
    [],
  );

  const logout = useCallback(() => {
    void Promise.allSettled([writeQueueRef.current, financeSyncPendingRef.current]).then(
      async () => {
        await logoutFromSupabase();
        workspaceRef.current = null;
        previousStateRef.current = createEmptyState();
        setActiveUserState(null);
        setState(createEmptyState());
        setEnvelopes(defaultEnvelopeRules);
      },
    );
  }, []);

  const setActiveMonth = useCallback(
    (key: string) => {
      if (!state.months[key]) return;
      saveSessionPreference("activeMonth", key);
      setState({ ...state, activeMonth: key });
    },
    [state],
  );

  const setActivePerson = useCallback(
    (view: string) => {
      if (![VIEW_ALL, VIEW_ME, VIEW_SPOUSE, ...state.people].includes(view)) return;
      saveSessionPreference("activePerson", view);
      setState({ ...state, activePerson: view });
    },
    [state],
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
      // A freshly created future month hasn't started yet — treat it as a forecast until edited.
      planned: true,
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
    (
      label: string,
      income: number,
      houseContribution: number,
      profileBudgets: Record<string, number> = {},
      planned = false,
    ) => {
      const updated: MonthData = {
        ...month,
        label: label.trim(),
        income,
        houseContribution,
        profileBudgets,
        planned,
      };
      persist({ ...state, months: { ...state.months, [state.activeMonth]: updated } });
    },
    [state, month, persist],
  );

  const deleteMonth = useCallback(
    (key: string) => {
      const remainingKeys = Object.keys(state.months).filter((item) => item !== key);
      if (!remainingKeys.length) return; // always keep at least one month
      const months = { ...state.months };
      delete months[key];
      const activeMonth =
        state.activeMonth === key ? remainingKeys.sort().at(-1)! : state.activeMonth;
      persist({ ...state, months, activeMonth });
    },
    [state, persist],
  );

  const savePeople = useCallback(
    (people: string[]) => {
      const clean = people
        .map((person) => person.trim())
        .filter(Boolean)
        .filter(
          (person, index, list) =>
            list.findIndex(
              (item) => item.toLocaleLowerCase("pt-BR") === person.toLocaleLowerCase("pt-BR"),
            ) === index,
        );
      const newPeople = clean.length ? clean : [currentUserName()];
      const oldPeople = state.people;
      // Positional rename detection for every profile, including 0/1 (the
      // primary and spouse slots) — previously only index >= 2 was covered,
      // which left profileBudgets/expense.owner/priority.responsavel keyed
      // to a stale name after renaming either of the first two profiles.
      const renamedProfiles = oldPeople
        .map((oldName, index) => ({ oldName, newName: newPeople[index] }))
        .filter(({ oldName, newName }) => oldName && newName && oldName !== newName);
      const months = Object.fromEntries(
        Object.entries(state.months).map(([monthKey, data]) => {
          const profileBudgets = { ...(data.profileBudgets || {}) };
          renamedProfiles.forEach(({ oldName, newName }) => {
            if (profileBudgets[oldName] !== undefined) {
              profileBudgets[newName] = profileBudgets[oldName];
              delete profileBudgets[oldName];
            }
          });
          return [
            monthKey,
            {
              ...data,
              profileBudgets,
              expenses: data.expenses.map((expense) => {
                const renamed = renamedProfiles.find((item) => expense.owner === item.oldName);
                return renamed ? { ...expense, owner: renamed.newName } : expense;
              }),
              priorities: data.priorities.map((priority) => {
                const renamed = renamedProfiles.find(
                  (item) => priority.responsavel === item.oldName,
                );
                return renamed ? { ...priority, responsavel: renamed.newName } : priority;
              }),
            },
          ];
        }),
      );
      const activePerson = [VIEW_ALL, VIEW_ME, VIEW_SPOUSE, ...newPeople].includes(
        state.activePerson,
      )
        ? state.activePerson
        : VIEW_ME;
      persist({ ...state, people: newPeople, months, activePerson });
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

  /** Adds imported expenses, grouping them into the right month by competence/date (may span months). */
  const importExpenses = useCallback(
    (rows: Expense[]) => {
      if (!rows.length) return;
      const months = { ...state.months };
      rows.forEach((expense) => {
        const key = expense.competence || expense.date.slice(0, 7);
        const current = months[key] || createEmptyMonth(key);
        months[key] = { ...current, expenses: [...current.expenses, expense] };
      });
      persist({ ...state, months });
    },
    [state, persist],
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

  const saveEnvelopes = useCallback((next: EnvelopeRule[]) => {
    setEnvelopes(next);
    const householdId = workspaceRef.current?.householdId;
    if (!householdId) return;
    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        setEnvelopes(await saveRemoteEnvelopes(householdId, next));
      })
      .catch((error) => {
        console.error("Falha ao sincronizar envelopes", error);
        toast.error("Não foi possível salvar os envelopes. Verifique sua conexão e tente de novo.");
      });
  }, []);

  const resetSeed = useCallback(() => {
    persist(migrateState(createSeedState(), activeUser?.name));
  }, [persist, activeUser]);

  const value: FinanceContextValue = {
    ready,
    authError,
    retryAuth,
    hideValues,
    toggleHideValues,
    activeUser,
    state,
    month,
    envelopes,
    login,
    register,
    loginWithGoogle,
    logout,
    createInvite,
    joinHousehold,
    savePushSubscription: savePushSubscriptionAction,
    removePushSubscription: removePushSubscriptionAction,
    hasPushSubscription: hasPushSubscriptionAction,
    saveAiConsent: saveAiConsentAction,
    revokeAiConsent: revokeAiConsentAction,
    getAiConsentStatus: getAiConsentStatusAction,
    setActiveMonth,
    setActivePerson,
    createNextMonth,
    saveMonthSettings,
    deleteMonth,
    savePeople,
    saveExpense,
    importExpenses,
    deleteExpense,
    duplicateExpense,
    toggleExpenseStatus,
    savePriority,
    deletePriority,
    togglePriorityStatus,
    saveEnvelopes,
    exportData,
    importData,
    resetSeed,
    writeConflict,
    refreshAfterConflict,
    dismissWriteConflict,
  };

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance(): FinanceContextValue {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance must be used within FinanceProvider");
  return ctx;
}

/** Currency formatter aware of the "hide values" toggle — masks with "R$ ••••" when active. */
export function useMoney(): (value: number) => string {
  const { hideValues } = useFinance();
  return useCallback((value: number) => (hideValues ? "R$ ••••" : money(value)), [hideValues]);
}

/** Compact currency formatter (chart labels) aware of the "hide values" toggle. */
export function useMoneyShort(): (value: number) => string {
  const { hideValues } = useFinance();
  return useCallback((value: number) => (hideValues ? "R$ ••••" : moneyShort(value)), [hideValues]);
}

export { profileId };

function createEmptyMonth(key: string): MonthData {
  return {
    label: formatMonthLabel(key),
    income: 0,
    houseContribution: 0,
    profileBudgets: {},
    expenses: [],
    priorities: [],
  };
}

function createEmptyState(): FinanceState {
  const key = new Date().toISOString().slice(0, 7);
  return {
    people: [],
    activePerson: VIEW_ME,
    activeMonth: key,
    months: { [key]: createEmptyMonth(key) },
  };
}

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
        category: normalizeCategory(String(dataRow[categoryIndex] || ""), name),
        amount,
        status:
          String(dataRow[statusIndex] || "")
            .toLowerCase()
            .includes("pag") &&
          !String(dataRow[statusIndex] || "")
            .toLowerCase()
            .includes("pago")
            ? "A pagar"
            : String(dataRow[statusIndex] || "")
                  .toLowerCase()
                  .includes("pago")
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
        category: normalizeCategory(String(dataRow[categoryIndex] || ""), name),
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
  return headers.findIndex((header) =>
    names.some(
      (name) => header === normalizeHeader(name) || header.includes(normalizeHeader(name)),
    ),
  );
}

function parseSheetAmount(value: unknown): number {
  if (typeof value === "number") return Math.abs(value);
  const clean = String(value || "").replace(/[^\d,.-]/g, "");
  if (!clean) return 0;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  return Math.abs(Number(normalized || 0));
}

function normalizeCategory(value: string, establishmentName = ""): string {
  const normalized = normalizeHeader(value);
  const matched = categories.find((category) => normalizeHeader(category) === normalized);
  if (matched) return matched;
  const learned = establishmentName ? lookupLearnedCategory(establishmentName) : null;
  return learned || "Outros";
}

function normalizeOwner(value: string, fallback = "Minha casa"): string {
  const normalized = normalizeHeader(value);
  if (!normalized) return fallback;
  if (normalized.includes("pai") || normalized.includes("namorada") || normalized.includes("outra"))
    return "Outra casa";
  if (normalized.includes("minha") || normalized.includes("meus") || normalized.includes("junior"))
    return "Minha casa";
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
  const name = stringFromRecord(row, [
    "descricao",
    "descrição",
    "description",
    "item",
    "nome",
    "gasto",
  ]);
  const amount = parseSheetAmount(valueFromRecord(row, ["valor", "amount", "preco", "preço"]));
  if (!name || !amount || shouldIgnoreImportedName(name)) return null;
  const date = normalizeSheetDate(
    valueFromRecord(row, ["data", "date", "vencimento"]),
    fallbackMonth,
  );
  return {
    id: String(valueFromRecord(row, ["id", "id_gasto"]) || uid()),
    name,
    category: normalizeCategory(stringFromRecord(row, ["categoria", "category", "tipo"]), name),
    amount,
    status: normalizeExpenseStatus(stringFromRecord(row, ["status", "situacao", "situação"])),
    owner: normalizeOwner(
      stringFromRecord(row, ["responsavel", "responsável", "owner", "pessoa", "nome_usuario"]),
    ),
    date,
    paymentMethod: normalizePayment(
      stringFromRecord(row, [
        "forma_pagamento",
        "forma de pagamento",
        "pagamento",
        "paymentMethod",
      ]),
    ),
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

function monthKeyFromRecord(
  row: Record<string, unknown>,
  date: string,
  fallbackMonth: string,
): string {
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
  if (context.includes("pai") || context.includes("namorada") || context.includes("outra"))
    return "Outra casa";
  if (/\bcasa\b/.test(context)) return "Outra casa";
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
