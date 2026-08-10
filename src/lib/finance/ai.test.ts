import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FinanceState } from "./types";

const mockSupabase = {
  auth: { getSession: vi.fn() },
};
vi.mock("../supabase/client", () => ({ supabase: mockSupabase }));

const mockConsent = { hasAiConsent: vi.fn(() => true) };
vi.mock("./aiConsent", () => mockConsent);

// Dynamic, not static: a static top-level import would resolve "../supabase/client"
// before the mocks above finish initializing — see aiConsentRepository.test.ts.
const { GeminiRequestError, askGemini, answerLocally, buildAiContext, describeFallback } =
  await import("./ai");

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
        ],
      },
    },
  };
}

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}

beforeEach(() => {
  mockConsent.hasAiConsent.mockReturnValue(true);
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: "token-123" } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("buildAiContext — privacy allowlist regression guard (P0-05B round 1: no new field added)", () => {
  it("only ever produces the fields aiRequestValidation already allowlists — no new field slipped in", () => {
    const context = buildAiContext(baseState());
    expect(Object.keys(context).sort()).toEqual(
      [
        "gastos",
        "maiorCategoria",
        "mes",
        "orcamento",
        "pago",
        "pendente",
        "planejamento",
        "prioridades",
        "saldoRestante",
        "totalGasto",
        "visao",
      ].sort(),
    );
  });

  it("each gasto entry only has the fields the schema allows — no id, no extra field", () => {
    const context = buildAiContext(baseState());
    for (const item of context.gastos) {
      expect(Object.keys(item).sort()).toEqual(
        ["categoria", "data", "descricao", "pagamento", "responsavel", "status", "valor"].sort(),
      );
    }
  });

  it("each prioridade entry only has the fields the schema allows — no id, no `saved`", () => {
    const context = buildAiContext(baseState());
    for (const item of context.prioridades) {
      expect(Object.keys(item).sort()).toEqual(
        ["descricao", "prioridade", "responsavel", "status", "valor"].sort(),
      );
    }
  });

  it("never includes household_id, user_id, profile_id, expense_id, or any technical identifier", () => {
    const context = buildAiContext(baseState());
    const serialized = JSON.stringify(context);
    expect(serialized).not.toMatch(/household_id|user_id|profile_id|expense_id|"id":/i);
    // the real expense/priority ids from baseState() must not appear anywhere
    expect(serialized).not.toContain("expense-1");
    expect(serialized).not.toContain("priority-1");
  });

  it("never includes an account name or email", () => {
    const context = buildAiContext(baseState());
    expect(JSON.stringify(context)).not.toMatch(/@/); // no email-shaped string anywhere
  });

  it("never includes another month's data — only the active month crosses the boundary", () => {
    const context = buildAiContext(baseState());
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("Gasto de julho");
    expect(serialized).not.toContain("Julho 2026");
  });

  it("never serializes the raw FinanceState (no people array, no months map)", () => {
    const context = buildAiContext(baseState()) as unknown as Record<string, unknown>;
    expect(context).not.toHaveProperty("people");
    expect(context).not.toHaveProperty("months");
    expect(context).not.toHaveProperty("activeMonth");
  });
});

describe("askGemini — failure classification (so the UI can be honest about why it fell back)", () => {
  it("classifies missing local consent as 'consent' before ever touching the network", async () => {
    mockConsent.hasAiConsent.mockReturnValue(false);
    await expect(askGemini("oi", {})).rejects.toMatchObject({ reason: "consent" });
    expect(mockSupabase.auth.getSession).not.toHaveBeenCalled();
  });

  it("classifies a server 403 (consent revoked/out of date) as 'consent'", async () => {
    mockFetchOnce(403, { error: "Consentimento de IA necessario ou desatualizado" });
    await expect(askGemini("oi", validContext())).rejects.toMatchObject({ reason: "consent" });
  });

  it("classifies a server 429 as 'rate_limit'", async () => {
    mockFetchOnce(429, { error: "Muitas perguntas em pouco tempo." });
    await expect(askGemini("oi", validContext())).rejects.toMatchObject({ reason: "rate_limit" });
  });

  it("classifies a server 504 (timeout) as 'unavailable', never as if Gemini had answered", async () => {
    mockFetchOnce(504, { error: "Tempo de resposta excedido. Tente novamente." });
    await expect(askGemini("oi", validContext())).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("classifies a server 502 (upstream/blocked) as 'unavailable'", async () => {
    mockFetchOnce(502, { error: "Assistente de IA indisponivel no momento" });
    await expect(askGemini("oi", validContext())).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("classifies a raw network failure (fetch throws) as 'unavailable', not a silent generic Error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const result = askGemini("oi", validContext());
    await expect(result).rejects.toBeInstanceOf(GeminiRequestError);
    await expect(result).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("classifies an empty answer body as 'unavailable' rather than resolving with nothing", async () => {
    mockFetchOnce(200, {});
    await expect(askGemini("oi", validContext())).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("still resolves normally on a clean 200 with an answer", async () => {
    mockFetchOnce(200, { answer: "Voce esta dentro do orcamento." });
    await expect(askGemini("oi", validContext())).resolves.toBe("Voce esta dentro do orcamento.");
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

function validContext() {
  return buildAiContext(baseState());
}
