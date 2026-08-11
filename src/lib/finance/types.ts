// Core domain types for the household finance app.
// Ported 1:1 from the original vanilla app — financial rules unchanged.

export type ExpenseStatus = "Pago" | "A pagar";
export type PriorityStatus = "A pagar" | "Pago" | "Adiar";
export type EntryType = "expense" | "income";

export interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  status: ExpenseStatus;
  type?: EntryType;
  owner: string; // "Minha casa" | "Outra casa"
  date: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  competence?: string; // YYYY-MM
  paidBy?: string;
  paymentMethod: string;
  note: string;
  recurring?: boolean;
  recurringKey?: string;
  installmentKey?: string;
  installmentNumber?: number;
  installmentTotal?: number;
  createdAt?: string;
  /**
   * Bank-assigned unique transaction identifier (e.g. OFX FITID), when the
   * expense came from a bank statement import. Not yet persisted to Supabase
   * — see the proposed `bank_transaction_id` migration — so today this only
   * survives for the lifetime of the in-memory session; it lets a second
   * import in the same session tell two genuinely distinct transactions
   * apart even when they share date/amount/description.
   */
  bankTransactionId?: string;
  /** Optimistic-concurrency token from the DB row. Absent for a not-yet-synced local record. */
  version?: number;
}

export interface Priority {
  id: string;
  name: string;
  amount: number;
  rank: number; // 1 alta, 2 média, 3 baixa
  status: PriorityStatus;
  responsavel: string;
  saved?: number;
  createdAt?: string;
  /** Optimistic-concurrency token from the DB row. Absent for a not-yet-synced local record. */
  version?: number;
}

export interface MonthData {
  label: string;
  income: number;
  houseContribution: number;
  profileBudgets?: Record<string, number>;
  planned?: boolean;
  expenses: Expense[];
  priorities: Priority[];
}

export interface FinanceState {
  people: string[];
  activePerson: string; // VIEW_ME | VIEW_SPOUSE
  activeMonth: string; // YYYY-MM
  months: Record<string, MonthData>;
}

export interface Profile {
  id: string;
  name: string;
  pin: string;
}

export interface ActiveUser {
  id: string;
  name: string;
  /** From Supabase Auth (auth.users.email) — null on the rare account that has none. Never sent to the AI. */
  email: string | null;
}

export interface EnvelopeRule {
  id: string;
  label: string;
  limit: number;
  categories: string[];
}

export type ViewKey = "assistant" | "dashboard" | "transactions" | "priorities" | "settings";

/** A row from an imported file that couldn't be attributed to a real profile — see FinanceContext's resolveKnownOwner. */
export interface ImportSkippedRow {
  reason: "unresolved_owner";
  /** The raw text from the file — shown to the user so they know what to fix, never silently mapped to a guess. */
  ownerRaw: string;
  description: string;
}

/** What importData resolves with once the remote write is actually confirmed — see P0-IMPORT-1 Etapa 1/5. */
export interface ImportSummary {
  importedExpenses: number;
  importedPriorities: number;
  skipped: ImportSkippedRow[];
  /** Rows that resolved a valid owner but were already present (deduped away) — not counted in importedExpenses/importedPriorities. */
  duplicates: number;
}
