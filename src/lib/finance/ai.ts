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

export function buildAiContext(state: FinanceState) {
  const monthData = state.months[state.activeMonth];
  const view = state.activePerson;
  const numbers = calc(monthData, view, state.activeMonth);
  const currentExpenses = expensesForView(monthData, view)
    .slice()
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, 20)
    .map((item) => ({
      descricao: item.name,
      categoria: item.category,
      valor: Number(item.amount || 0),
      status: item.status,
      responsavel: item.owner,
      data: item.date,
      pagamento: item.paymentMethod || "Pix",
    }));
  const currentPriorities = monthData.priorities
    .filter((item) => priorityMatchesView(item, view))
    .slice()
    .sort((a, b) => a.rank - b.rank || Number(b.amount || 0) - Number(a.amount || 0))
    .map((item) => ({
      descricao: item.name,
      valor: Number(item.amount || 0),
      prioridade: item.rank,
      status: item.status,
      responsavel: item.responsavel || currentUserName(),
    }));
  return {
    mes: monthData.label,
    planejamento: Boolean(monthData.planned),
    visao: viewLabel(view),
    orcamento: budgetForView(monthData, view),
    totalGasto: numbers.total,
    pendente: numbers.pending,
    pago: numbers.paid,
    saldoRestante: numbers.free,
    maiorCategoria: numbers.topCategory || null,
    gastos: currentExpenses,
    prioridades: currentPriorities,
  };
}

/** Offline heuristic answer — used when Gemini is unavailable. */
const INTENT_KEYWORDS: Array<{ intent: string; words: string[] }> = [
  { intent: "responsavel", words: ["responsavel", "responsaveis", "casal", "cada um"] },
  { intent: "pendente", words: ["falta", "faltam", "pagar", "pendente", "pendencia", "pendencias"] },
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
  const numbers = calc(monthData, view, state.activeMonth);
  const filteredExpenses = expensesForView(monthData, view);
  const pending = filteredExpenses.filter((item) => item.status === "A pagar");

  if (intent === "responsavel") {
    return [
      `${currentUserName()}: ${money(sum(expensesForView(monthData, VIEW_ME)))}`,
      `${spouseName()}: ${money(sum(expensesForView(monthData, VIEW_SPOUSE)))}`,
    ].join(" | ");
  }
  if (intent === "pendente") {
    const top = pending
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
      .filter((item) => priorityMatchesView(item, view) && item.status === "A pagar")
      .slice()
      .sort((a, b) => a.rank - b.rank || b.amount - a.amount)[0];
    if (!first) return "Você não tem prioridades pendentes agora.";
    return numbers.free >= first.amount
      ? `Dá para pagar ${first.name} de ${money(first.amount)} e ainda ficaria com ${money(numbers.free - first.amount)}.`
      : `Eu adiaria ${first.name} por enquanto. Faltam ${money(first.amount - numbers.free)} para pagar sem apertar o saldo.`;
  }
  if (intent === "pessoa") {
    return state.people
      .map((person) => `${person}: ${money(sum(monthData.expenses.filter((item) => item.owner === person)))}`)
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

/** Call the secure Gemini backend; throws if unavailable so callers can fall back. */
export async function askGemini(question: string, context: unknown): Promise<string> {
  const response = await fetch("/api/gemini-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, context }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : typeof data?.details === "string"
          ? data.details
          : "Gemini indisponivel";
    console.warn("Gemini backend unavailable:", message);
    throw new Error(message);
  }
  if (!data.answer) throw new Error("Resposta vazia");
  return data.answer as string;
}
