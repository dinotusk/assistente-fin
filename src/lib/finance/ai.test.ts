import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FinanceState } from "./types";
import type { AiIntent } from "./aiRequestValidation";

const mockConsent = { hasAiConsent: vi.fn(() => true) };
vi.mock("./aiConsent", () => mockConsent);

const mockBackendClient = { sendAssistantMessage: vi.fn() };
vi.mock("../api/backendClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/backendClient")>();
  return { ...actual, sendAssistantMessage: mockBackendClient.sendAssistantMessage };
});

// Dynamic, not static: a static top-level import would resolve the mocked modules above
// before their factories finish initializing — see aiConsentRepository.test.ts.
const {
  GeminiRequestError,
  askGemini,
  answerLocally,
  buildAiContext,
  classifyAiIntent,
  describeFallback,
} = await import("./ai");
const { BackendApiError } = await import("../api/backendClient");

const ALL_INTENTS: AiIntent[] = [
  "BALANCE",
  "MONTH_OVERVIEW",
  "EXPENSE_ANALYSIS",
  "GOALS",
  "BILLS",
  "COMPARISON",
  "GENERAL",
];

function baseState(): FinanceState {
  return {
    people: ["Maria", "Oziel"],
    activePerson: "me",
    activeMonth: "2026-08",
    months: {
      "2026-07": {
        label: "Julho 2026",
        income: 5000,
        houseContribution: 1000,
        expenses: [
          {
            id: "old-month-expense",
            name: "Gasto de julho — não deve vazar",
            category: "Outros",
            amount: 999,
            status: "Pago",
            owner: "Maria",
            date: "2026-07-05",
            paymentMethod: "Pix",
            note: "",
          },
        ],
        priorities: [],
      },
      "2026-08": {
        label: "Agosto 2026",
        income: 5000,
        houseContribution: 1000,
        expenses: [
          {
            id: "expense-1",
            name: "Aluguel",
            category: "Casa",
            amount: 1200,
            status: "Pago",
            owner: "Maria",
            date: "2026-08-01",
            paymentMethod: "Pix",
            note: "",
          },
          {
            id: "expense-2",
            name: "Internet",
            category: "Casa",
            amount: 150,
            status: "A pagar",
            owner: "Maria",
            date: "2026-08-10",
            dueDate: "2026-08-20",
            paymentMethod: "Pix",
            note: "",
          },
        ],
        priorities: [
          {
            id: "priority-1",
            name: "Trocar geladeira",
            amount: 1500,
            rank: 1,
            status: "A pagar",
            responsavel: "Maria",
            saved: 300,
          },
          {
            id: "priority-2",
            name: "Viagem",
            amount: 2000,
            rank: 2,
            status: "A pagar",
            responsavel: "Maria",
          },
        ],
      },
    },
  };
}

beforeEach(() => {
  mockConsent.hasAiConsent.mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("classifyAiIntent — local, synchronous, deterministic", () => {
  it.each([
    ["Quanto ainda posso gastar?", "BALANCE"],
    ["Qual o meu saldo?", "BALANCE"],
    ["Como está meu mês?", "MONTH_OVERVIEW"],
    ["Me dá um resumo do mês", "MONTH_OVERVIEW"],
    ["O que está pesando mais?", "EXPENSE_ANALYSIS"],
    ["Em qual categoria eu mais gastei?", "EXPENSE_ANALYSIS"],
    ["Como estão minhas metas?", "GOALS"],
    ["Posso comprar uma geladeira nova?", "GOALS"],
    ["O que vence essa semana?", "BILLS"],
    ["Quanto ainda falta pagar?", "BILLS"],
    ["Gastei mais que o mês passado?", "COMPARISON"],
    ["Comparado ao mês anterior, como estou?", "COMPARISON"],
  ] as const)("classifies %s as %s", (question, expected) => {
    expect(classifyAiIntent(question)).toBe(expected);
  });

  it("falls back to GENERAL for an unrecognized/ambiguous question", () => {
    expect(classifyAiIntent("blablabla sem intent nenhum")).toBe("GENERAL");
    expect(classifyAiIntent("oi")).toBe("GENERAL");
  });

  it("classifies every current AssistantView quick-reply shortcut as expected", () => {
    expect(classifyAiIntent("Análise do mês")).toBe("MONTH_OVERVIEW");
    expect(classifyAiIntent("Falta pagar")).toBe("BILLS");
    expect(classifyAiIntent("Meu limite")).toBe("BALANCE");
    expect(classifyAiIntent("Prioridades")).toBe("GOALS");
  });
});

describe("buildAiContext — selective context per intent (P0-05B round 2)", () => {
  it("BALANCE sends only the aggregate header — no gastos, no prioridades, no maiorCategoria", () => {
    const context = buildAiContext(baseState(), "BALANCE");
    expect(Object.keys(context).sort()).toEqual(
      [
        "tipo",
        "mes",
        "planejamento",
        "visao",
        "orcamento",
        "totalGasto",
        "pendente",
        "pago",
        "saldoRestante",
      ].sort(),
    );
  });

  it("MONTH_OVERVIEW adds maiorCategoria but still excludes gastos/prioridades", () => {
    const context = buildAiContext(baseState(), "MONTH_OVERVIEW");
    expect(Object.keys(context).sort()).toEqual(
      [
        "tipo",
        "mes",
        "planejamento",
        "visao",
        "orcamento",
        "totalGasto",
        "pendente",
        "pago",
        "saldoRestante",
        "maiorCategoria",
      ].sort(),
    );
  });

  it("EXPENSE_ANALYSIS returns a category breakdown, never individual expense fields", () => {
    const context = buildAiContext(baseState(), "EXPENSE_ANALYSIS");
    expect(context).toHaveProperty("categorias");
    if ("categorias" in context) {
      for (const entry of context.categorias) {
        expect(Object.keys(entry).sort()).toEqual(["category", "total"].sort());
      }
    }
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("descricao");
    expect(serialized).not.toContain("responsavel");
    expect(serialized).not.toContain("Aluguel");
  });

  it("GOALS excludes gastos entirely and includes saldoRestante for affordability judgment", () => {
    const context = buildAiContext(baseState(), "GOALS");
    expect(Object.keys(context).sort()).toEqual(
      ["tipo", "mes", "planejamento", "visao", "saldoRestante", "metas"].sort(),
    );
    expect(JSON.stringify(context)).not.toContain("Aluguel");
  });

  it("GOALS includes valorGuardado/faltante/progresso only for a priority that tracks saved", () => {
    const context = buildAiContext(baseState(), "GOALS");
    if (!("metas" in context)) throw new Error("expected GOALS context");
    const withSaved = context.metas.find((m) => m.descricao === "Trocar geladeira");
    const withoutSaved = context.metas.find((m) => m.descricao === "Viagem");
    expect(withSaved).toMatchObject({ valorGuardado: 300, faltante: 1200 });
    expect(withSaved?.progresso).toBeCloseTo(0.2);
    expect(withoutSaved).not.toHaveProperty("valorGuardado");
    expect(withoutSaved).not.toHaveProperty("faltante");
    expect(withoutSaved).not.toHaveProperty("progresso");
  });

  it("BILLS includes only pending ('A pagar') expenses, sorted by dueDate/date", () => {
    const context = buildAiContext(baseState(), "BILLS");
    if (!("contas" in context)) throw new Error("expected BILLS context");
    expect(context.contas.length).toBe(1);
    expect(context.contas[0].descricao).toBe("Internet");
    expect(context.contas[0].dueDate).toBe("2026-08-20");
    // The paid "Aluguel" expense must never appear just to pad the context.
    expect(JSON.stringify(context)).not.toContain("Aluguel");
  });

  it("BILLS omits dueDate for an entry whose Expense.dueDate is absent — still valid, no invented date", () => {
    const state = baseState();
    state.months["2026-08"].expenses[1].dueDate = undefined;
    const context = buildAiContext(state, "BILLS");
    if (!("contas" in context)) throw new Error("expected BILLS context");
    expect(context.contas[0]).not.toHaveProperty("dueDate");
  });

  it("COMPARISON sends only current-month aggregates — no prior-month field at all", () => {
    const context = buildAiContext(baseState(), "COMPARISON");
    expect(Object.keys(context).sort()).toEqual(
      [
        "tipo",
        "mes",
        "planejamento",
        "visao",
        "orcamento",
        "totalGasto",
        "pendente",
        "pago",
        "saldoRestante",
      ].sort(),
    );
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("Julho");
    expect(serialized).not.toContain("Gasto de julho");
  });

  it("GENERAL is the same safe minimal shape as BALANCE — never the old full shape", () => {
    const context = buildAiContext(baseState(), "GENERAL");
    expect(Object.keys(context).sort()).toEqual(
      [
        "tipo",
        "mes",
        "planejamento",
        "visao",
        "orcamento",
        "totalGasto",
        "pendente",
        "pago",
        "saldoRestante",
      ].sort(),
    );
  });

  it("EXPENSE_ANALYSIS never exceeds the dedicated 13-category cap, even with every category populated", () => {
    const state = baseState();
    const categories = [
      "Alimentação",
      "Transporte",
      "Casa",
      "Gasto fixo",
      "Saúde",
      "Lazer",
      "Educação",
      "Cartões",
      "Dívida",
      "Empréstimo",
      "Investimento",
      "Livre",
      "Outros",
    ];
    state.months["2026-08"].expenses = categories.map((category, i) => ({
      id: `cat-expense-${i}`,
      name: `Gasto ${category}`,
      category,
      amount: 50,
      status: "Pago",
      owner: "Maria",
      date: "2026-08-01",
      paymentMethod: "Pix",
      note: "",
    }));
    const context = buildAiContext(state, "EXPENSE_ANALYSIS");
    if (!("categorias" in context)) throw new Error("expected EXPENSE_ANALYSIS context");
    expect(context.categorias.length).toBe(13);
  });

  describe.each(ALL_INTENTS)(
    "privacy regression — %s never leaks technical identifiers",
    (intent) => {
      it("never includes household_id, user_id, profile_id, expense_id, email, or raw ids", () => {
        const context = buildAiContext(baseState(), intent);
        const serialized = JSON.stringify(context);
        expect(serialized).not.toMatch(/household_id|user_id|profile_id|expense_id|"id":/i);
        expect(serialized).not.toContain("expense-1");
        expect(serialized).not.toContain("expense-2");
        expect(serialized).not.toContain("priority-1");
        expect(serialized).not.toContain("priority-2");
        expect(serialized).not.toMatch(/@/);
      });

      it("never serializes the raw FinanceState (no people array, no months map)", () => {
        const context = buildAiContext(baseState(), intent) as unknown as Record<string, unknown>;
        expect(context).not.toHaveProperty("people");
        expect(context).not.toHaveProperty("months");
        expect(context).not.toHaveProperty("activeMonth");
      });

      it("never includes another month's data — only the active month crosses the boundary", () => {
        const serialized = JSON.stringify(buildAiContext(baseState(), intent));
        expect(serialized).not.toContain("Gasto de julho");
        expect(serialized).not.toContain("Julho 2026");
      });
    },
  );
});

describe("P0-FRONTEND-1C.1 — ActiveUser.email can never leak into the AI context", () => {
  it("buildAiContext's own signature never accepts an ActiveUser — only FinanceState and AiIntent", () => {
    // Structural guarantee, not incidental: buildAiContext takes (state, intent)
    // only, so activeUser.email (added this round) has no parameter to travel
    // through even if a future caller tried to pass it.
    expect(buildAiContext.length).toBe(2);
  });

  it("ai.ts never imports/references ActiveUser or an email field at all", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(__dirname, "./ai.ts"), "utf8");
    expect(source).not.toMatch(/ActiveUser/);
    expect(source).not.toMatch(/\bemail\b/i);
  });

  it.each(ALL_INTENTS)("%s context never contains an e-mail-shaped string", (intent) => {
    const serialized = JSON.stringify(buildAiContext(baseState(), intent));
    expect(serialized).not.toMatch(/@/);
  });
});

describe("askGemini — failure classification (so the UI can be honest about why it fell back)", () => {
  it("classifies missing local consent as 'consent' before ever touching the network", async () => {
    mockConsent.hasAiConsent.mockReturnValue(false);
    await expect(askGemini("oi")).rejects.toMatchObject({ reason: "consent" });
    expect(mockBackendClient.sendAssistantMessage).not.toHaveBeenCalled();
  });

  it("sends only the question — no financial context — to the backend", async () => {
    mockBackendClient.sendAssistantMessage.mockResolvedValue({ answer: "ok" });
    await askGemini("Qual meu saldo?");
    expect(mockBackendClient.sendAssistantMessage).toHaveBeenCalledWith("Qual meu saldo?");
    expect(mockBackendClient.sendAssistantMessage).toHaveBeenCalledTimes(1);
  });

  it("classifies a backend 403 (AiConsentGate) as 'consent'", async () => {
    mockBackendClient.sendAssistantMessage.mockRejectedValue(
      new BackendApiError("Consentimento de IA necessario ou desatualizado.", 403, "ACCESS_DENIED"),
    );
    await expect(askGemini("oi")).rejects.toMatchObject({ reason: "consent" });
  });

  it("classifies a backend 429 (AiRateLimiter) as 'rate_limit'", async () => {
    mockBackendClient.sendAssistantMessage.mockRejectedValue(
      new BackendApiError("Muitas perguntas em pouco tempo.", 429, "RATE_LIMITED"),
    );
    await expect(askGemini("oi")).rejects.toMatchObject({ reason: "rate_limit" });
  });

  it("classifies a backend 5xx (EXTERNAL_SERVICE_ERROR) as 'unavailable', never as if the assistant had answered", async () => {
    mockBackendClient.sendAssistantMessage.mockRejectedValue(
      new BackendApiError("Assistente indisponivel no momento.", 502, "EXTERNAL_SERVICE_ERROR"),
    );
    await expect(askGemini("oi")).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("classifies a missing/expired session (401 from backendClient) as 'unavailable'", async () => {
    mockBackendClient.sendAssistantMessage.mockRejectedValue(
      new BackendApiError("Sessao nao encontrada", 401),
    );
    await expect(askGemini("oi")).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("classifies a raw network failure as 'unavailable', not a silent generic Error", async () => {
    mockBackendClient.sendAssistantMessage.mockRejectedValue(new TypeError("Failed to fetch"));
    const result = askGemini("oi");
    await expect(result).rejects.toBeInstanceOf(GeminiRequestError);
    await expect(result).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("classifies an empty answer body as 'unavailable' rather than resolving with nothing", async () => {
    mockBackendClient.sendAssistantMessage.mockResolvedValue({ answer: "" });
    await expect(askGemini("oi")).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("still resolves normally on a clean answer", async () => {
    mockBackendClient.sendAssistantMessage.mockResolvedValue({
      answer: "Voce esta dentro do orcamento.",
    });
    await expect(askGemini("oi")).resolves.toBe("Voce esta dentro do orcamento.");
  });
});

describe("describeFallback — labels a user can tell apart from a real answer", () => {
  it("gives each reason a distinct, non-empty label", () => {
    const consent = describeFallback("consent");
    const rateLimit = describeFallback("rate_limit");
    const unavailable = describeFallback("unavailable");
    expect(consent).toBeTruthy();
    expect(rateLimit).toBeTruthy();
    expect(unavailable).toBeTruthy();
    expect(new Set([consent, rateLimit, unavailable]).size).toBe(3);
  });

  it("the rate-limit label reads as a status message, not a generic financial summary", () => {
    expect(describeFallback("rate_limit")).toMatch(/limite/i);
  });

  it("the consent label mentions consent, not a masked/generic answer", () => {
    expect(describeFallback("consent")).toMatch(/consentimento/i);
  });

  it("every label marks itself as a local/non-Gemini response", () => {
    for (const reason of ["consent", "rate_limit", "unavailable"] as const) {
      expect(describeFallback(reason)).toMatch(/local/i);
    }
  });
});

describe("answerLocally — never returns a blank fallback", () => {
  it("returns a non-empty answer even for a question matching no known intent", () => {
    const answer = answerLocally("blablabla sem intent nenhum", baseState());
    expect(answer.length).toBeGreaterThan(0);
  });
});
