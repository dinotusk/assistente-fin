// Core domain types for the household finance app.
// Ported 1:1 from the original vanilla app — financial rules unchanged.

export type ExpenseStatus = "Pago" | "A pagar";
export type PriorityStatus = "A pagar" | "Pago" | "Adiar";

export interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  status: ExpenseStatus;
  owner: string; // "Minha casa" | "Pai da namorada"
  date: string; // YYYY-MM-DD
  paymentMethod: string;
  note: string;
  createdAt?: string;
}

export interface Priority {
  id: string;
  name: string;
  amount: number;
  rank: number; // 1 alta, 2 média, 3 baixa
  status: PriorityStatus;
  responsavel: string;
  createdAt?: string;
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
}

export interface EnvelopeRule {
  id: string;
  label: string;
  limit: number;
  categories: string[];
}

export type ViewKey = "assistant" | "dashboard" | "transactions" | "priorities" | "settings";
