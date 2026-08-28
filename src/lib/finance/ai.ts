// Local AI fallback + context builder for the Gemini backend.
import {
  calc,
  budgetForView,
  currentUserName,
  expensesForView,
  getCategoryTotals,
  money,
  normalizeText,
  priorityMatchesView,
  spouseName,
  viewLabel,
} from "./calc";
import { VIEW_ME, VIEW_SPOUSE } from "./constants";
import type { FinanceState } from "./types";
import { hasAiConsent } from "./aiConsent";
import { BackendApiError, sendAssistantMessage } from "../api/backendClient";
import {
  MAX_AI_CATEGORY_ITEMS,
  MAX_CONTEXT_ITEMS,
  MAX_CONTEXT_TEXT_LENGTH,
  type AiBillEntry,
  type AiChatContext,
  type AiGoalEntry,
  type AiIntent,
} from "./aiRequestValidation";

/** Bounds a string to the context's shared text-size ceiling — same limit the server enforces. */
function clip(value: string): string {
  return value.slice(0, MAX_CONTEXT_TEXT_LENGTH);
}

/**
 * Which slice of the question drives context selection — deliberately separate
 * from `matchIntent`/`INTENT_KEYWORDS` below, which only feeds the offline
 * fallback answer and has different categories. Local, synchronous, no network
 * call. GENERAL is the safe default for anything ambiguous or unrecognized —
 * never the old full-shape context, which is now the most expensive one, not
 * the fallback one.
 */
const AI_INTENT_PATTERNS: Array<{ intent: AiIntent; phrases: string[] }> = [
  {
    intent: "COMPARISON",
    phrases: [
      "mes passado",
      "mes anterior",
      "em relacao a",
      "comparado",
      "comparacao",
      "cresceu",
      "aumentou",
      "diminuiu",
    ],
  },
  {
    intent: "BILLS",
    phrases: [
      "vence",
      "vencimento",
      "vencimentos",
      "conta a pagar",
      "contas a pagar",
      "falta pagar",
      "pendencia",
      "pendencias",
    ],
  },
  {
    intent: "GOALS",
    phrases: [
      "meta",
      "metas",
      "prioridade",
      "prioridades",
      "posso comprar",
      "consigo comprar",
      "da pra comprar",
    ],
  },
  {
    intent: "EXPENSE_ANALYSIS",
    phrases: [
      "categoria",
      "onde gastei",
      "onde estou gastando",
      "maior gasto",
      "gastando mais",
      "o que pesa",
      "esta pesando",
    ],
  },
  {
    intent: "MONTH_OVERVIEW",
    phrases: ["resumo", "como esta meu mes", "como esta o mes", "visao geral", "analise do mes"],
  },
  {
    intent: "BALANCE",
    phrases: [
      "saldo",
      "sobra",
      "sobrou",
      "disponivel",
      "quanto tenho",
      "posso gastar",
      "meu limite",
    ],
  },
];

/** Local, synchronous, deterministic — never calls Gemini. Ties/ambiguity fall back to GENERAL. */
export function classifyAiIntent(question: string): AiIntent {
  const normalized = normalizeText(question);
  const match = AI_INTENT_PATTERNS.find(({ phrases }) =>
    phrases.some((phrase) => normalized.includes(phrase)),
  );
  return match?.intent ?? "GENERAL";
}

/** Shared numeric header every variant needs to know "what month/view this is about". */
function buildBase(state: FinanceState) {
  const monthData = state.months[state.activeMonth];
  const view = state.activePerson;
  return {
    monthData,
    view,
    base: {
      mes: clip(monthData.label),
      planejamento: Boolean(monthData.planned),
      visao: clip(viewLabel(view)),
    },
  };
}

function buildAggregates(
  monthData: FinanceState["months"][string],
  view: string,
  state: FinanceState,
) {
  const numbers = calc(monthData, view, state.activeMonth, state.people);
  return {
    numbers,
    aggregates: {
      orcamento: budgetForView(monthData, view),
      totalGasto: numbers.total,
      pendente: numbers.pending,
      pago: numbers.paid,
      saldoRestante: numbers.free,
    },
  };
}

/**
 * Builds only the context fields the classified intent actually needs (P0-05B
 * round 2) — no more sending the full gastos/prioridades shape for every
 * question. Still capped in count/length the same way, still carries no
 * internal ids, emails, tokens or other technical metadata.
 */
export function buildAiContext(state: FinanceState, intent: AiIntent): AiChatContext {
  const { monthData, view, base } = buildBase(state);
  const { numbers, aggregates } = buildAggregates(monthData, view, state);

  switch (intent) {
    case "MONTH_OVERVIEW":
      return {
        tipo: "MONTH_OVERVIEW",
        ...base,
        ...aggregates,
        maiorCategoria: numbers.topCategory
          ? { category: clip(numbers.topCategory.category), total: numbers.topCategory.total }
          : null,
      };

    case "EXPENSE_ANALYSIS":
      return {
        tipo: "EXPENSE_ANALYSIS",
        ...base,
        ...aggregates,
        categorias: getCategoryTotals(monthData, view, state.people)
          .slice(0, MAX_AI_CATEGORY_ITEMS)
          .map((item) => ({ category: clip(item.category), total: item.total })),
      };

    case "GOALS": {
      const metas: AiGoalEntry[] = monthData.priorities
        .filter((item) => priorityMatchesView(item, view, state.people))
        .slice()
        .sort((a, b) => a.rank - b.rank || Number(b.amount || 0) - Number(a.amount || 0))
        .slice(0, MAX_CONTEXT_ITEMS)
        .map((item) => {
          const valorAlvo = Number(item.amount || 0);
          const entry: AiGoalEntry = {
            descricao: clip(item.name),
            valorAlvo,
            prioridade: item.rank,
            status: clip(item.status),
            responsavel: clip(item.responsavel || currentUserName()),
          };
          // Only compute progress fields when `saved` genuinely exists — never
          // invent a zero for a priority that never tracked savings at all.
          if (typeof item.saved === "number" && Number.isFinite(item.saved)) {
            entry.valorGuardado = item.saved;
            entry.faltante = Math.max(0, valorAlvo - item.saved);
            entry.progresso = valorAlvo > 0 ? Math.min(1, item.saved / valorAlvo) : 0;
          }
          return entry;
        });
      return { tipo: "GOALS", ...base, saldoRestante: numbers.free, metas };
    }

    case "BILLS": {
      const contas: AiBillEntry[] = expensesForView(monthData, view, state.people)
        .filter((item) => item.status === "A pagar")
        .slice()
        .sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date))
        .slice(0, MAX_CONTEXT_ITEMS)
        .map((item) => {
          const entry: AiBillEntry = {
            descricao: clip(item.name),
            categoria: clip(item.category),
            valor: Number(item.amount || 0),
            responsavel: clip(item.owner),
            data: item.date,
          };
          if (item.dueDate) entry.dueDate = item.dueDate;
          return entry;
        });
      return { tipo: "BILLS", ...base, contas };
    }

    case "BALANCE":
      return { tipo: "BALANCE", ...base, ...aggregates };

    case "COMPARISON":
      // Round 2 deliberately sends only the current month — see the AiComparisonContext
      // doc comment in aiRequestValidation.ts for why prior-month data is deferred.
      return { tipo: "COMPARISON", ...base, ...aggregates };

    case "GENERAL":
    default:
      return { tipo: "GENERAL", ...base, ...aggregates };
  }
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
 * Why askGemini failed, coarse enough for the UI to pick an honest fallback framing
 * without parsing error message strings (which are just display copy, not a stable
 * contract). "consent" covers both "never granted" and "granted locally but the
 * server says revoked/out of date" — the caller doesn't need to tell those apart.
 */
export type AiFailureReason = "consent" | "rate_limit" | "unavailable";

/** Thrown by askGemini for every failure path, always carrying a classified `reason`. */
export class GeminiRequestError extends Error {
  readonly reason: AiFailureReason;
  constructor(message: string, reason: AiFailureReason) {
    super(message);
    this.name = "GeminiRequestError";
    this.reason = reason;
  }
}

/** Short, honest label shown above a fallback answer — never implies it's a full Gemini reply. */
const FALLBACK_LABELS: Record<AiFailureReason, string> = {
  consent: "Resposta local — consentimento de IA pendente",
  rate_limit: "Resposta local — limite de perguntas atingido",
  unavailable: "Resposta local — IA temporariamente indisponível",
};

export function describeFallback(reason: AiFailureReason): string {
  return FALLBACK_LABELS[reason];
}

/**
 * Call the Aval Assistant backend (Railway — see AssistantController); throws
 * GeminiRequestError (always classified) if unavailable so callers can fall back with an
 * honest, specific reason instead of a generic catch-all. Hard-blocks without consent —
 * the last line of defense even though the caller (AssistantView) is expected to gate the
 * UI before ever reaching this call; the server independently re-checks consent regardless
 * (AiConsentGate), so this is a UX shortcut, not the enforcement boundary.
 *
 * <p>P7: no financial context is built or sent from the client anymore — the backend
 * resolves everything itself via the Financial Tools, from the caller's own JWT. See
 * buildAiContext's own callers (now none, kept for its unit tests/possible future use).
 */
export async function askGemini(question: string): Promise<string> {
  if (!hasAiConsent()) {
    throw new GeminiRequestError("Consentimento de IA necessario", "consent");
  }

  try {
    const result = await sendAssistantMessage(question);
    if (!result.answer) throw new GeminiRequestError("Resposta vazia", "unavailable");
    return result.answer;
  } catch (error) {
    if (error instanceof GeminiRequestError) throw error;
    if (error instanceof BackendApiError) {
      console.warn("Assistant backend unavailable:", error.message);
      const reason: AiFailureReason =
        error.status === 403 ? "consent" : error.status === 429 ? "rate_limit" : "unavailable";
      throw new GeminiRequestError(error.message, reason);
    }
    throw new GeminiRequestError(
      error instanceof Error ? error.message : "Falha de rede",
      "unavailable",
    );
  }
}
