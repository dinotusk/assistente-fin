// Shared strict validation for the Gemini chat request — imported by the client
// (ai.ts, before sending) and the server route (gemini-chat.ts, as the actual
// enforcement boundary). Keeping one module means the two can't drift apart.

export const MAX_QUESTION_LENGTH = 2000;
export const MAX_CONTEXT_ITEMS = 12;
export const MAX_CONTEXT_TEXT_LENGTH = 120;
export const MAX_BODY_BYTES = 24_000;

export interface AiContextEntry {
  descricao: string;
  categoria: string;
  valor: number;
  status: string;
  responsavel: string;
  data: string;
  pagamento: string;
}

export interface AiContextPriority {
  descricao: string;
  valor: number;
  prioridade: number;
  status: string;
  responsavel: string;
}

export interface AiChatContext {
  mes: string;
  planejamento: boolean;
  visao: string;
  orcamento: number;
  totalGasto: number;
  pendente: number;
  pago: number;
  saldoRestante: number;
  maiorCategoria: { category: string; total: number } | null;
  gastos: AiContextEntry[];
  prioridades: AiContextPriority[];
}

export interface AiChatRequest {
  question: string;
  context: AiChatContext;
}

export type AiChatValidationResult =
  { ok: true; value: AiChatRequest } | { ok: false; error: string };

const CONTEXT_KEYS = new Set([
  "mes",
  "planejamento",
  "visao",
  "orcamento",
  "totalGasto",
  "pendente",
  "pago",
  "saldoRestante",
  "maiorCategoria",
  "gastos",
  "prioridades",
]);

const EXPENSE_ENTRY_KEYS = new Set([
  "descricao",
  "categoria",
  "valor",
  "status",
  "responsavel",
  "data",
  "pagamento",
]);

const PRIORITY_ENTRY_KEYS = new Set(["descricao", "valor", "prioridade", "status", "responsavel"]);

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

function validateExpenseEntry(entry: unknown): entry is AiContextEntry {
  if (!isPlainObject(entry) || !hasOnlyKeys(entry, EXPENSE_ENTRY_KEYS)) return false;
  return (
    isBoundedString(entry.descricao, MAX_CONTEXT_TEXT_LENGTH) &&
    isBoundedString(entry.categoria, MAX_CONTEXT_TEXT_LENGTH) &&
    isFiniteNumber(entry.valor) &&
    isBoundedString(entry.status, MAX_CONTEXT_TEXT_LENGTH) &&
    isBoundedString(entry.responsavel, MAX_CONTEXT_TEXT_LENGTH) &&
    typeof entry.data === "string" &&
    entry.data.length <= MAX_CONTEXT_TEXT_LENGTH &&
    isBoundedString(entry.pagamento, MAX_CONTEXT_TEXT_LENGTH)
  );
}

function validatePriorityEntry(entry: unknown): entry is AiContextPriority {
  if (!isPlainObject(entry) || !hasOnlyKeys(entry, PRIORITY_ENTRY_KEYS)) return false;
  return (
    isBoundedString(entry.descricao, MAX_CONTEXT_TEXT_LENGTH) &&
    isFiniteNumber(entry.valor) &&
    isFiniteNumber(entry.prioridade) &&
    isBoundedString(entry.status, MAX_CONTEXT_TEXT_LENGTH) &&
    isBoundedString(entry.responsavel, MAX_CONTEXT_TEXT_LENGTH)
  );
}

function validateContext(context: unknown): context is AiChatContext {
  if (!isPlainObject(context) || !hasOnlyKeys(context, CONTEXT_KEYS)) return false;
  if (typeof context.mes !== "string" || context.mes.length > MAX_CONTEXT_TEXT_LENGTH) return false;
  if (typeof context.planejamento !== "boolean") return false;
  if (!isBoundedString(context.visao, MAX_CONTEXT_TEXT_LENGTH)) return false;
  if (
    !isFiniteNumber(context.orcamento) ||
    !isFiniteNumber(context.totalGasto) ||
    !isFiniteNumber(context.pendente) ||
    !isFiniteNumber(context.pago) ||
    !isFiniteNumber(context.saldoRestante)
  )
    return false;
  if (context.maiorCategoria !== null) {
    if (
      !isPlainObject(context.maiorCategoria) ||
      !hasOnlyKeys(context.maiorCategoria, new Set(["category", "total"])) ||
      !isBoundedString(context.maiorCategoria.category, MAX_CONTEXT_TEXT_LENGTH) ||
      !isFiniteNumber(context.maiorCategoria.total)
    )
      return false;
  }
  if (!Array.isArray(context.gastos) || context.gastos.length > MAX_CONTEXT_ITEMS) return false;
  if (!context.gastos.every(validateExpenseEntry)) return false;
  if (!Array.isArray(context.prioridades) || context.prioridades.length > MAX_CONTEXT_ITEMS)
    return false;
  if (!context.prioridades.every(validatePriorityEntry)) return false;
  return true;
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
