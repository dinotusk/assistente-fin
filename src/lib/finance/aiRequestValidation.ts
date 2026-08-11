// Shared strict validation for the Gemini chat request — imported by the client
// (ai.ts, before sending) and the server route (gemini-chat.ts, as the actual
// enforcement boundary). Keeping one module means the two can't drift apart.
//
// P0-05B round 2: the context sent to the AI is no longer one fixed shape for
// every question — it's a discriminated union keyed by `tipo` (the classified
// intent), each variant carrying only the fields that intent needs. Validation
// stays fail-closed per variant: an unknown `tipo`, or a key that belongs to a
// different variant (e.g. "gastos" on a GOALS context), is rejected exactly
// like an unknown field was rejected under the old single-shape schema.

export const MAX_QUESTION_LENGTH = 2000;
export const MAX_CONTEXT_ITEMS = 12;
/** Category breakdown is its own, separate cap — it holds aggregates (one row per
 *  category), not individual gastos, so it isn't bound by MAX_CONTEXT_ITEMS. Sized
 *  to the app's fixed category list (see constants.ts `categories`, 13 entries) so
 *  every category can be sent when all of them have spend, with no silent drop. */
export const MAX_AI_CATEGORY_ITEMS = 13;
export const MAX_CONTEXT_TEXT_LENGTH = 120;
export const MAX_BODY_BYTES = 24_000;

export type AiIntent =
  "BALANCE" | "MONTH_OVERVIEW" | "EXPENSE_ANALYSIS" | "GOALS" | "BILLS" | "COMPARISON" | "GENERAL";

const AI_INTENTS = new Set<AiIntent>([
  "BALANCE",
  "MONTH_OVERVIEW",
  "EXPENSE_ANALYSIS",
  "GOALS",
  "BILLS",
  "COMPARISON",
  "GENERAL",
]);

interface AiContextBase {
  mes: string;
  planejamento: boolean;
  visao: string;
}

export interface AiCategoryTotal {
  category: string;
  total: number;
}

export interface AiBalanceContext extends AiContextBase {
  tipo: "BALANCE";
  orcamento: number;
  totalGasto: number;
  pendente: number;
  pago: number;
  saldoRestante: number;
}

export interface AiMonthOverviewContext extends AiContextBase {
  tipo: "MONTH_OVERVIEW";
  orcamento: number;
  totalGasto: number;
  pendente: number;
  pago: number;
  saldoRestante: number;
  maiorCategoria: AiCategoryTotal | null;
}

export interface AiExpenseAnalysisContext extends AiContextBase {
  tipo: "EXPENSE_ANALYSIS";
  orcamento: number;
  totalGasto: number;
  pendente: number;
  pago: number;
  saldoRestante: number;
  categorias: AiCategoryTotal[];
}

export interface AiGoalEntry {
  descricao: string;
  valorAlvo: number;
  /** Only present when the priority actually tracks savings (Priority.saved is a
   *  real number) — absence must never be treated as/synthesized into a zero. */
  valorGuardado?: number;
  faltante?: number;
  progresso?: number;
  prioridade: number;
  status: string;
  responsavel: string;
}

export interface AiGoalsContext extends AiContextBase {
  tipo: "GOALS";
  saldoRestante: number;
  metas: AiGoalEntry[];
}

export interface AiBillEntry {
  descricao: string;
  categoria: string;
  valor: number;
  responsavel: string;
  data: string;
  /** Only present when Expense.dueDate actually exists. */
  dueDate?: string;
}

export interface AiBillsContext extends AiContextBase {
  tipo: "BILLS";
  contas: AiBillEntry[];
}

/** Round 2: current-month aggregates only — no prior-month data. See COMPARISON
 *  row in aiRequestValidation.ts / P0-05B round 2 decisions: sending historical
 *  aggregates would expand the data described in the current AI consent copy, so
 *  that's deferred to a future round alongside a consent-copy review. */
export interface AiComparisonContext extends AiContextBase {
  tipo: "COMPARISON";
  orcamento: number;
  totalGasto: number;
  pendente: number;
  pago: number;
  saldoRestante: number;
}

export interface AiGeneralContext extends AiContextBase {
  tipo: "GENERAL";
  orcamento: number;
  totalGasto: number;
  pendente: number;
  pago: number;
  saldoRestante: number;
}

export type AiChatContext =
  | AiBalanceContext
  | AiMonthOverviewContext
  | AiExpenseAnalysisContext
  | AiGoalsContext
  | AiBillsContext
  | AiComparisonContext
  | AiGeneralContext;

export interface AiChatRequest {
  question: string;
  context: AiChatContext;
}

export type AiChatValidationResult =
  { ok: true; value: AiChatRequest } | { ok: false; error: string };

const AGGREGATE_KEYS = ["orcamento", "totalGasto", "pendente", "pago", "saldoRestante"] as const;

const BASE_KEYS = ["tipo", "mes", "planejamento", "visao"] as const;

const BALANCE_KEYS = new Set<string>([...BASE_KEYS, ...AGGREGATE_KEYS]);
const MONTH_OVERVIEW_KEYS = new Set<string>([...BASE_KEYS, ...AGGREGATE_KEYS, "maiorCategoria"]);
const EXPENSE_ANALYSIS_KEYS = new Set<string>([...BASE_KEYS, ...AGGREGATE_KEYS, "categorias"]);
const GOALS_KEYS = new Set<string>([...BASE_KEYS, "saldoRestante", "metas"]);
const BILLS_KEYS = new Set<string>([...BASE_KEYS, "contas"]);
const COMPARISON_KEYS = new Set<string>([...BASE_KEYS, ...AGGREGATE_KEYS]);
const GENERAL_KEYS = new Set<string>([...BASE_KEYS, ...AGGREGATE_KEYS]);

const CATEGORY_TOTAL_KEYS = new Set(["category", "total"]);

const GOAL_ENTRY_KEYS = new Set([
  "descricao",
  "valorAlvo",
  "valorGuardado",
  "faltante",
  "progresso",
  "prioridade",
  "status",
  "responsavel",
]);

const BILL_ENTRY_KEYS = new Set([
  "descricao",
  "categoria",
  "valor",
  "responsavel",
  "data",
  "dueDate",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

function isOptionalBoundedString(value: unknown, maxLength: number): boolean {
  return value === undefined || isBoundedString(value, maxLength);
}

function validateBase(context: Record<string, unknown>): boolean {
  return (
    typeof context.mes === "string" &&
    context.mes.length > 0 &&
    context.mes.length <= MAX_CONTEXT_TEXT_LENGTH &&
    typeof context.planejamento === "boolean" &&
    isBoundedString(context.visao, MAX_CONTEXT_TEXT_LENGTH)
  );
}

function validateAggregates(context: Record<string, unknown>): boolean {
  return AGGREGATE_KEYS.every((key) => isFiniteNumber(context[key]));
}

function validateCategoryTotal(entry: unknown): entry is AiCategoryTotal {
  if (!isPlainObject(entry) || !hasOnlyKeys(entry, CATEGORY_TOTAL_KEYS)) return false;
  return isBoundedString(entry.category, MAX_CONTEXT_TEXT_LENGTH) && isFiniteNumber(entry.total);
}

function validateGoalEntry(entry: unknown): entry is AiGoalEntry {
  if (!isPlainObject(entry) || !hasOnlyKeys(entry, GOAL_ENTRY_KEYS)) return false;
  return (
    isBoundedString(entry.descricao, MAX_CONTEXT_TEXT_LENGTH) &&
    isFiniteNumber(entry.valorAlvo) &&
    isOptionalFiniteNumber(entry.valorGuardado) &&
    isOptionalFiniteNumber(entry.faltante) &&
    isOptionalFiniteNumber(entry.progresso) &&
    isFiniteNumber(entry.prioridade) &&
    isBoundedString(entry.status, MAX_CONTEXT_TEXT_LENGTH) &&
    isBoundedString(entry.responsavel, MAX_CONTEXT_TEXT_LENGTH)
  );
}

function validateBillEntry(entry: unknown): entry is AiBillEntry {
  if (!isPlainObject(entry) || !hasOnlyKeys(entry, BILL_ENTRY_KEYS)) return false;
  return (
    isBoundedString(entry.descricao, MAX_CONTEXT_TEXT_LENGTH) &&
    isBoundedString(entry.categoria, MAX_CONTEXT_TEXT_LENGTH) &&
    isFiniteNumber(entry.valor) &&
    isBoundedString(entry.responsavel, MAX_CONTEXT_TEXT_LENGTH) &&
    typeof entry.data === "string" &&
    entry.data.length > 0 &&
    entry.data.length <= MAX_CONTEXT_TEXT_LENGTH &&
    isOptionalBoundedString(entry.dueDate, MAX_CONTEXT_TEXT_LENGTH)
  );
}

function validateContext(context: unknown): context is AiChatContext {
  if (!isPlainObject(context)) return false;
  const tipo = context.tipo;
  if (typeof tipo !== "string" || !AI_INTENTS.has(tipo as AiIntent)) return false;

  switch (tipo as AiIntent) {
    case "BALANCE":
      return (
        hasOnlyKeys(context, BALANCE_KEYS) && validateBase(context) && validateAggregates(context)
      );

    case "MONTH_OVERVIEW": {
      if (
        !hasOnlyKeys(context, MONTH_OVERVIEW_KEYS) ||
        !validateBase(context) ||
        !validateAggregates(context)
      )
        return false;
      return context.maiorCategoria === null || validateCategoryTotal(context.maiorCategoria);
    }

    case "EXPENSE_ANALYSIS": {
      if (
        !hasOnlyKeys(context, EXPENSE_ANALYSIS_KEYS) ||
        !validateBase(context) ||
        !validateAggregates(context)
      )
        return false;
      return (
        Array.isArray(context.categorias) &&
        context.categorias.length <= MAX_AI_CATEGORY_ITEMS &&
        context.categorias.every(validateCategoryTotal)
      );
    }

    case "GOALS": {
      if (!hasOnlyKeys(context, GOALS_KEYS) || !validateBase(context)) return false;
      if (!isFiniteNumber(context.saldoRestante)) return false;
      return (
        Array.isArray(context.metas) &&
        context.metas.length <= MAX_CONTEXT_ITEMS &&
        context.metas.every(validateGoalEntry)
      );
    }

    case "BILLS": {
      if (!hasOnlyKeys(context, BILLS_KEYS) || !validateBase(context)) return false;
      return (
        Array.isArray(context.contas) &&
        context.contas.length <= MAX_CONTEXT_ITEMS &&
        context.contas.every(validateBillEntry)
      );
    }

    case "COMPARISON":
      return (
        hasOnlyKeys(context, COMPARISON_KEYS) &&
        validateBase(context) &&
        validateAggregates(context)
      );

    case "GENERAL":
      return (
        hasOnlyKeys(context, GENERAL_KEYS) && validateBase(context) && validateAggregates(context)
      );

    default:
      return false;
  }
}

/** Strict, reject-unknown-fields validation — the single enforcement point shared by client and server. */
export function validateAiChatRequest(input: unknown): AiChatValidationResult {
  if (!isPlainObject(input) || !hasOnlyKeys(input, new Set(["question", "context"]))) {
    return { ok: false, error: "Requisicao invalida" };
  }
  const { question, context } = input;
  if (typeof question !== "string" || !question.trim()) {
    return { ok: false, error: "Pergunta vazia" };
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return { ok: false, error: "Pergunta muito longa" };
  }
  if (!validateContext(context)) {
    return { ok: false, error: "Contexto financeiro invalido" };
  }
  return { ok: true, value: { question: question.trim(), context } };
}
