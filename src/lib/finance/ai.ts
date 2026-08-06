// Local AI fallback + context builder for the Gemini backend.
import {
  calc,
  budgetForView,
  currentUserName,
  expensesForView,
  money,
  normalizeText,
  priorityMatchesView,
  spouseName,
  viewLabel,
} from "./calc";
import { VIEW_ME, VIEW_SPOUSE } from "./constants";
import type { FinanceState } from "./types";
import { supabase } from "../supabase/client";
import { hasAiConsent } from "./aiConsent";
import {
  MAX_CONTEXT_ITEMS,
  MAX_CONTEXT_TEXT_LENGTH,
  validateAiChatRequest,
  type AiChatContext,
} from "./aiRequestValidation";

/** Bounds a string to the context's shared text-size ceiling — same limit the server enforces. */
function clip(value: string): string {
  return value.slice(0, MAX_CONTEXT_TEXT_LENGTH);
}

/**
 * Builds the minimal context sent to the AI: only the numbers and the most relevant
 * gastos/prioridades for the active view, capped in count and per-field length. No
 * internal ids, emails, tokens or other technical metadata are included.
 */
export function buildAiContext(state: FinanceState): AiChatContext {
  const monthData = state.months[state.activeMonth];
  const view = state.activePerson;
  const numbers = calc(monthData, view, state.activeMonth, state.people);
  const currentExpenses = expensesForView(monthData, view, state.people)
    .slice()
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, MAX_CONTEXT_ITEMS)
    .map((item) => ({
      descricao: clip(item.name),
      categoria: clip(item.category),
      valor: Number(item.amount || 0),
      status: clip(item.status),
      responsavel: clip(item.owner),
      data: item.date,
      pagamento: clip(item.paymentMethod || "Pix"),
    }));
  const currentPriorities = monthData.priorities
    .filter((item) => priorityMatchesView(item, view, state.people))
    .slice()
    .sort((a, b) => a.rank - b.rank || Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, MAX_CONTEXT_ITEMS)
    .map((item) => ({
      descricao: clip(item.name),
      valor: Number(item.amount || 0),
      prioridade: item.rank,
      status: clip(item.status),
      responsavel: clip(item.responsavel || currentUserName()),
    }));
  return {
    mes: clip(monthData.label),
    planejamento: Boolean(monthData.planned),
    visao: clip(viewLabel(view)),
    orcamento: budgetForView(monthData, view),
    totalGasto: numbers.total,
    pendente: numbers.pending,
    pago: numbers.paid,
    saldoRestante: numbers.free,
    maiorCategoria: numbers.topCategory
      ? { category: clip(numbers.topCategory.category), total: numbers.topCategory.total }
      : null,
    gastos: currentExpenses,
    prioridades: currentPriorities,
  };
}

/** Offline heuristic answer — used when Gemini is unavailable. */
const INTENT_KEYWORDS: Array<{ intent: string; words: string[] }> = [
  { intent: "responsavel", words: ["responsavel", "responsaveis", "casal", "cada um"] },
  {
    intent: "pendente",
    words: ["falta", "faltam", "pagar", "pendente", "pendencia", "pendencias"],
  },
  { intent: "prioridade", words: ["prioridade", "prioridades", "comprar", "posso", "consigo"] },
  { intent: "pessoa", words: ["pessoa", "quem", "gastou"] },
  { intent: "saldo", words: ["saldo", "sobrar", "sobra", "sobrou", "disponivel"] },
];

/** Matches a normalized question against intent keywords by whole word, not raw substring. */
function matchIntent(normalizedQuestion: string): string | null {
  const questionWords = new Set(normalizedQuestion.split(/\s+/).filter(Boolean));
  const match = INTENT_KEYWORDS.find(({ words }) => words.some((word) => questionWords.has(word)));
  return match?.intent || null;
}

/** Offline heuristic answer — used when Gemini is unavailable. */
export function answerLocally(question: string, state: FinanceState): string {
  const intent = matchIntent(normalizeText(question));
  const monthData = state.months[state.activeMonth];
  const view = state.activePerson;
  const numbers = calc(monthData, view, state.activeMonth, state.people);
  const filteredExpenses = expensesForView(monthData, view, state.people);
  const pending = filteredExpenses.filter((item) => item.status === "A pagar");

  if (intent === "responsavel") {
    return [
      `${state.people[0] || currentUserName()}: ${money(sum(expensesForView(monthData, VIEW_ME, state.people)))}`,
      `${state.people[1] || spouseName()}: ${money(sum(expensesForView(monthData, VIEW_SPOUSE, state.people)))}`,
    ].join(" | ");
  }
  if (intent === "pendente") {
    const top =
      pending
        .slice()
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3)
        .map((item) => `${item.name} (${money(item.amount)})`)
        .join(", ") || "nenhuma";
    return monthData.planned
      ? `Previsto até agora: ${money(numbers.pending)}. Os maiores itens planejados são: ${top}.`
      : `Ainda faltam ${money(numbers.pending)}. As maiores pendências são: ${top}.`;
  }
  if (intent === "prioridade") {
    const first = monthData.priorities
      .filter((item) => priorityMatchesView(item, view, state.people) && item.status === "A pagar")
      .slice()
      .sort((a, b) => a.rank - b.rank || b.amount - a.amount)[0];
    if (!first) return "Você não tem prioridades pendentes agora.";
    return numbers.free >= first.amount
      ? `Dá para pagar ${first.name} de ${money(first.amount)} e ainda ficaria com ${money(numbers.free - first.amount)}.`
      : `Eu adiaria ${first.name} por enquanto. Faltam ${money(first.amount - numbers.free)} para pagar sem apertar o saldo.`;
  }
  if (intent === "pessoa") {
    return state.people
      .map(
        (person) =>
          `${person}: ${money(sum(monthData.expenses.filter((item) => item.owner === person)))}`,
      )
      .join(" · ");
  }
  if (intent === "saldo") {
    return `Com a renda de ${money(monthData.income)} e gastos de ${money(numbers.total)}, o saldo livre estimado é ${money(numbers.free)}.`;
  }
  return monthData.planned
    ? `Planejamento do mês: ${money(numbers.total)} previstos, ${money(numbers.pending)} ainda por definir como pago, saldo previsto ${money(numbers.free)}.`
    : `Resumo rápido: total do mês ${money(numbers.total)}, falta pagar ${money(numbers.pending)}, saldo livre ${money(numbers.free)}.`;
}

function sum(items: { amount?: number }[]): number {
  return items.reduce((total, item) => total + Number(item.amount || 0), 0);
}

/**
 * Call the secure Gemini backend; throws if unavailable so callers can fall back.
 * Hard-blocks without consent and validates the outgoing payload — this is the last
 * line of defense even though the caller (AssistantView) is expected to gate the UI
 * before ever reaching this call.
 */
export async function askGemini(question: string, context: unknown): Promise<string> {
  if (!hasAiConsent()) {
    throw new Error("Consentimento de IA necessario");
  }
  const validated = validateAiChatRequest({ question, context });
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sessao nao encontrada");

  const response = await fetch("/api/gemini-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(validated.value),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : "Assistente indisponivel";
    console.warn("Gemini backend unavailable:", message);
    throw new Error(message);
  }
  if (!data.answer) throw new Error("Resposta vazia");
  return data.answer as string;
}
