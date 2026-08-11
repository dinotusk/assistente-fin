import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AI_CONSENT_VERSION } from "@/lib/finance/aiConsent";
import { MAX_BODY_BYTES } from "@/lib/finance/aiRequestValidation";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  rpc: vi.fn(),
  from: vi.fn(),
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockSupabase),
}));

const VALID_CONTEXT = {
  tipo: "BALANCE",
  mes: "Agosto de 2026",
  planejamento: false,
  visao: "Tudo",
  orcamento: 5000,
  totalGasto: 1200,
  pendente: 300,
  pago: 900,
  saldoRestante: 3800,
};

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/gemini-chat", {
    method: "POST",
    headers: { authorization: "Bearer token-123", "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Chainable .from().select().eq().maybeSingle() stub for the ai_consents lookup. */
function makeConsentQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  return query;
}

/** "Currently consented" baseline for every test not specifically about consent
 *  version enforcement — always the current AI_CONSENT_VERSION, not a literal,
 *  so a future version bump doesn't silently break every unrelated test here. */
function mockActiveConsent() {
  mockSupabase.from.mockReturnValue(
    makeConsentQuery({
      data: {
        consent_version: AI_CONSENT_VERSION,
        accepted_at: "2026-08-01T00:00:00Z",
        revoked_at: null,
      },
      error: null,
    }),
  );
}

async function importHandler() {
  const mod = await import("./gemini-chat");
  return mod.handleGeminiChatRequest;
}

describe("handleGeminiChatRequest", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabase.auth.getUser.mockReset();
    mockSupabase.rpc.mockReset();
    mockSupabase.from.mockReset();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("GEMINI_API_KEY", "gemini-key");
    vi.stubGlobal("fetch", vi.fn());
    mockActiveConsent();
    mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("401s when there is no bearer token", async () => {
    const handle = await importHandler();
    const request = new Request("http://localhost/api/gemini-chat", {
      method: "POST",
      body: JSON.stringify({ question: "oi", context: VALID_CONTEXT }),
    });
    const response = await handle(request);
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json).toEqual({ error: "Sessao invalida ou expirada" });
  });

  it("401s when the token does not resolve to a user", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("bad") });
    const handle = await importHandler();
    const response = await handle(makeRequest({ question: "oi", context: VALID_CONTEXT }));
    expect(response.status).toBe(401);
  });

  it("400s on malformed JSON", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const handle = await importHandler();
    const response = await handle(makeRequest("{ not json"));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toEqual({ error: "Corpo da requisicao invalido" });
  });

  it("400s on a request that fails schema validation", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const handle = await importHandler();
    const response = await handle(makeRequest({ question: "", context: VALID_CONTEXT }));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toEqual({ error: "Pergunta vazia" });
  });

  it("413s when the body exceeds the max size", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const handle = await importHandler();
    const hugeContext = {
      ...VALID_CONTEXT,
      visao: "x".repeat(MAX_BODY_BYTES + 1000),
    };
    const response = await handle(makeRequest({ question: "oi", context: hugeContext }));
    expect(response.status).toBe(413);
    const json = await response.json();
    expect(json).toEqual({ error: "Requisicao excede o tamanho maximo permitido" });
    // Never even reached auth-dependent consent/rate-limit checks for this oversized body.
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  describe("consent enforcement", () => {
    it("403s a direct API call with no consent record at all (bypassing the client's localStorage flag)", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
      mockSupabase.from.mockReturnValue(makeConsentQuery({ data: null, error: null }));
      const handle = await importHandler();
      const response = await handle(makeRequest({ question: "oi", context: VALID_CONTEXT }));
      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json).toEqual({ error: "Consentimento de IA necessario ou desatualizado" });
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it("403s when consent was granted but later revoked", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
      mockSupabase.from.mockReturnValue(
        makeConsentQuery({
          data: {
            consent_version: 1,
            accepted_at: "2026-08-01T00:00:00Z",
            revoked_at: "2026-08-02T00:00:00Z",
          },
          error: null,
        }),
      );
      const handle = await importHandler();
      const response = await handle(makeRequest({ question: "oi", context: VALID_CONTEXT }));
      expect(response.status).toBe(403);
    });

    it("403s on an out-of-date consent_version", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
      mockSupabase.from.mockReturnValue(
        makeConsentQuery({
          data: { consent_version: 0, accepted_at: "2026-08-01T00:00:00Z", revoked_at: null },
          error: null,
        }),
      );
      const handle = await importHandler();
      const response = await handle(makeRequest({ question: "oi", context: VALID_CONTEXT }));
      expect(response.status).toBe(403);
    });

    describe("P0-05B round 2.1 — AI_CONSENT_VERSION bump (1 -> 2)", () => {
      it("blocks a user still on consent_version 1 (pre-round-2.1) until they re-consent", async () => {
        mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
        mockSupabase.from.mockReturnValue(
          makeConsentQuery({
            data: { consent_version: 1, accepted_at: "2026-08-01T00:00:00Z", revoked_at: null },
            error: null,
          }),
        );
        const handle = await importHandler();
        const response = await handle(makeRequest({ question: "oi", context: VALID_CONTEXT }));
        expect(response.status).toBe(403);
        const json = await response.json();
        expect(json).toEqual({ error: "Consentimento de IA necessario ou desatualizado" });
      });

      it("authorizes a user on the current consent_version 2", async () => {
        mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
        mockSupabase.from.mockReturnValue(
          makeConsentQuery({
            data: { consent_version: 2, accepted_at: "2026-08-10T00:00:00Z", revoked_at: null },
            error: null,
          }),
        );
        mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
        const handle = await importHandler();
        const response = await handle(makeRequest({ question: "oi", context: VALID_CONTEXT }));
        // Never 403 — proceeds to the rate-limit check (and 502s here only
        // because `fetch` isn't mocked to succeed in this test).
        expect(response.status).not.toBe(403);
      });

      it("blocks again once a consent_version 2 grant is revoked", async () => {
        mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
        mockSupabase.from.mockReturnValue(
          makeConsentQuery({
            data: {
              consent_version: 2,
              accepted_at: "2026-08-10T00:00:00Z",
              revoked_at: "2026-08-10T01:00:00Z",
            },
            error: null,
          }),
        );
        const handle = await importHandler();
        const response = await handle(makeRequest({ question: "oi", context: VALID_CONTEXT }));
        expect(response.status).toBe(403);
      });
    });

    it("looks up consent by the JWT-verified user id, never by anything from the request body", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "verified-user-id" } },
        error: null,
      });
      const query = makeConsentQuery({
        data: { consent_version: 1, accepted_at: "2026-08-01T00:00:00Z", revoked_at: null },
        error: null,
      });
      mockSupabase.from.mockReturnValue(query);
      const handle = await importHandler();
      // The schema rejects unknown fields outright, so a spoofed id in the body
      // never even reaches this point — this asserts the lookup key regardless.
      await handle(makeRequest({ question: "oi", context: VALID_CONTEXT }));
      expect(query.eq).toHaveBeenCalledWith("user_id", "verified-user-id");
    });

    it("rejects a body carrying a spoofed user id field before any consent/rate-limit check runs", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
      const handle = await importHandler();
      const response = await handle(
        makeRequest({ question: "oi", context: VALID_CONTEXT, userId: "someone-elses-id" }),
      );
      expect(response.status).toBe(400);
      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it("fails closed when the consent lookup itself errors", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
      mockSupabase.from.mockReturnValue(
        makeConsentQuery({ data: null, error: new Error("db down") }),
      );
      const handle = await importHandler();
      const response = await handle(makeRequest({ question: "oi", context: VALID_CONTEXT }));
      expect(response.status).toBe(403);
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it("fails closed when neither SUPABASE_SECRET_KEY nor SUPABASE_SERVICE_ROLE_KEY is configured", async () => {
      // Explicit empty string, not unstubAllEnvs() — that would revert to whatever
      // the real host environment has set, which this test can't control or trust.
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
      vi.stubEnv("SUPABASE_SECRET_KEY", "");
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
      const handle = await importHandler();
      const response = await handle(makeRequest({ question: "oi", context: VALID_CONTEXT }));
      expect(response.status).toBe(403);
    });

    it("works from SUPABASE_SECRET_KEY alone (the official Vercel<->Supabase integration's name), with no SUPABASE_SERVICE_ROLE_KEY set", async () => {
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
      vi.stubEnv("SUPABASE_SECRET_KEY", "the-secret-key");
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
      const handle = await importHandler();
      const response = await handle(makeRequest({ question: "oi", context: VALID_CONTEXT }));
      // Reaches (and passes) the consent check instead of failing closed at 403.
      expect(response.status).not.toBe(403);
    });
  });

  it("429s when the distributed rate limit rejects the request", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockSupabase.rpc.mockResolvedValue({ data: false, error: null });
    const handle = await importHandler();
    const response = await handle(makeRequest({ question: "oi", context: VALID_CONTEXT }));
    expect(response.status).toBe(429);
    const json = await response.json();
    expect(json.error).toMatch(/muitas perguntas/i);
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "check_and_log_ai_rate_limit",
      expect.objectContaining({ p_user_id: "u1" }),
    );
  });

  it("fails closed (does not call Gemini) when the rate limit RPC itself errors", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockSupabase.rpc.mockResolvedValue({ data: null, error: new Error("db down") });
    const handle = await importHandler();
    const response = await handle(makeRequest({ question: "oi", context: VALID_CONTEXT }));
    expect(response.status).toBe(429);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("times out and never leaks upstream details when Gemini hangs", async () => {
    vi.useFakeTimers();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    vi.mocked(fetch).mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit).signal;
          signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted.");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );
    const handle = await importHandler();
    const responsePromise = handle(makeRequest({ question: "oi", context: VALID_CONTEXT }));
    await vi.advanceTimersByTimeAsync(15_000);
    const response = await responsePromise;
    expect(response.status).toBe(504);
    const json = await response.json();
    expect(json).toEqual({ error: "Tempo de resposta excedido. Tente novamente." });
  });

  it("sanitizes a provider error instead of forwarding the upstream body", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    vi.mocked(fetch).mockResolvedValue(
      new Response('{"error":{"message":"api key xyz-secret-123 invalid","status":"INVALID"}}', {
        status: 400,
      }),
    );
    const handle = await importHandler();
    const response = await handle(makeRequest({ question: "oi", context: VALID_CONTEXT }));
    expect(response.status).toBe(502);
    const json = await response.json();
    expect(json).toEqual({ error: "Assistente de IA indisponivel no momento" });
    expect(JSON.stringify(json)).not.toContain("xyz-secret-123");
    expect(json).not.toHaveProperty("details");
    expect(json).not.toHaveProperty("model");
  });

  it("sanitizes a safety-block response without exposing the block reason", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ candidates: [], promptFeedback: { blockReason: "SAFETY" } }),
    );
    const handle = await importHandler();
    const response = await handle(makeRequest({ question: "oi", context: VALID_CONTEXT }));
    expect(response.status).toBe(502);
    const json = await response.json();
    expect(json).toEqual({ error: "Nao consegui gerar uma resposta para essa pergunta." });
    expect(JSON.stringify(json)).not.toContain("SAFETY");
  });

  it("returns a clean answer on success", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        candidates: [{ content: { parts: [{ text: "Voce esta dentro do orcamento." }] } }],
      }),
    );
    const handle = await importHandler();
    const response = await handle(makeRequest({ question: "Como estou?", context: VALID_CONTEXT }));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ answer: "Voce esta dentro do orcamento." });
  });

  it("returns a clean answer when finishReason is explicitly STOP", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        candidates: [
          {
            content: { parts: [{ text: "Voce esta dentro do orcamento." }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 40, totalTokenCount: 160 },
      }),
    );
    const handle = await importHandler();
    const response = await handle(makeRequest({ question: "Como estou?", context: VALID_CONTEXT }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ answer: "Voce esta dentro do orcamento." });
  });

  it("never returns a MAX_TOKENS-truncated answer as if it were a complete success", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        candidates: [
          {
            content: { parts: [{ text: "Seu mes esta com o orcamento de R" }] },
            finishReason: "MAX_TOKENS",
          },
        ],
        usageMetadata: {
          promptTokenCount: 850,
          candidatesTokenCount: 12,
          thoughtsTokenCount: 686,
          totalTokenCount: 1548,
        },
      }),
    );
    const handle = await importHandler();
    const response = await handle(
      makeRequest({ question: "Como esta meu mes?", context: VALID_CONTEXT }),
    );
    expect(response.status).toBe(502);
    const json = await response.json();
    // The generic, already-approved unavailability message — never the cut-off text.
    expect(json).toEqual({ error: "Assistente de IA indisponivel no momento" });
    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain("Seu mes esta com o orcamento");
    expect(serialized).not.toContain("MAX_TOKENS");
    expect(serialized).not.toContain("thoughtsTokenCount");
    expect(json).not.toHaveProperty("finishReason");
    expect(json).not.toHaveProperty("usageMetadata");
  });

  it("a MAX_TOKENS failure classifies the same way any other unavailability does on the client", async () => {
    // The 502 status is what ai.ts's askGemini reads to classify the failure as
    // "unavailable" (see ai.test.ts) — this just confirms this path uses that status.
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        candidates: [{ content: { parts: [{ text: "truncado" }] }, finishReason: "MAX_TOKENS" }],
      }),
    );
    const handle = await importHandler();
    const response = await handle(makeRequest({ question: "oi", context: VALID_CONTEXT }));
    expect(response.status).toBe(502);
  });

  it("still returns the generic apology (never a crash) when there is no candidate and no block reason", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    vi.mocked(fetch).mockResolvedValue(Response.json({ candidates: [] }));
    const handle = await importHandler();
    const response = await handle(makeRequest({ question: "oi", context: VALID_CONTEXT }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ answer: "Nao consegui gerar uma resposta agora." });
  });

  it("sends the new generationConfig (higher maxOutputTokens + a bounded thinking budget) to Gemini", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }],
      }),
    );
    const handle = await importHandler();
    await handle(makeRequest({ question: "oi", context: VALID_CONTEXT }));
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.generationConfig.maxOutputTokens).toBe(2048);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 1024 });
    // Thinking budget must leave meaningfully more room for the visible answer than
    // it can itself consume — the whole point of round 1.1.
    expect(body.generationConfig.maxOutputTokens).toBeGreaterThan(
      body.generationConfig.thinkingConfig.thinkingBudget,
    );
  });
});

/**
 * P0-05B round 1 — tests the system prompt's CONTRACT (which instructions it gives
 * the model), never literal Gemini output, which nothing here can observe or control.
 * "Como está meu mês?" / "Quanto ainda posso gastar?" / "O que está pesando mais?" /
 * "Como estão minhas metas?" are the four representative questions from the audit's
 * quality gaps — used here just as realistic inputs, not as anything we assert a
 * specific reply to.
 */
describe("buildPrompt — the quality-of-answer contract given to Gemini", () => {
  async function importBuildPrompt() {
    const mod = await import("./gemini-chat");
    return mod.buildPrompt;
  }

  const REPRESENTATIVE_QUESTIONS = [
    "Como está meu mês?",
    "Quanto ainda posso gastar?",
    "O que está pesando mais?",
    "Como estão minhas metas?",
  ];

  it.each(REPRESENTATIVE_QUESTIONS)(
    "embeds the exact question verbatim, for %s",
    async (question) => {
      const buildPrompt = await importBuildPrompt();
      const prompt = buildPrompt(question, VALID_CONTEXT);
      expect(prompt).toContain(question);
    },
  );

  it.each(REPRESENTATIVE_QUESTIONS)(
    "instructs answering the real question first, for %s",
    async (question) => {
      const buildPrompt = await importBuildPrompt();
      const prompt = buildPrompt(question, VALID_CONTEXT);
      expect(prompt).toMatch(/responda primeiro.{0,40}diretamente.{0,40}pergunta/i);
    },
  );

  it("instructs adaptive depth — short for objective questions, developed for analysis — instead of a flat length rule", async () => {
    const buildPrompt = await importBuildPrompt();
    const prompt = buildPrompt("oi", VALID_CONTEXT);
    expect(prompt).toMatch(/adapte a profundidade/i);
    expect(prompt).toMatch(/pergunta objetiva.{0,60}curta/i);
    expect(prompt).toMatch(/analise.{0,80}desenvolvida|desenvolvida.{0,80}analise/i);
  });

  it("no longer forces every reply to be short — the old blanket brevity instruction is gone", async () => {
    const buildPrompt = await importBuildPrompt();
    const prompt = buildPrompt("oi", VALID_CONTEXT);
    expect(prompt).not.toMatch(/responda de forma curta/i);
    expect(prompt).not.toMatch(/use frases curtas/i);
  });

  it("no longer forces a mandatory closing summary on every answer", async () => {
    const buildPrompt = await importBuildPrompt();
    const prompt = buildPrompt("oi", VALID_CONTEXT);
    expect(prompt).not.toMatch(/termine com um resumo/i);
    expect(prompt).toMatch(/nao force um resumo final/i);
  });

  it("instructs using concrete numbers from the context when relevant", async () => {
    const buildPrompt = await importBuildPrompt();
    const prompt = buildPrompt("Quanto ainda posso gastar?", VALID_CONTEXT);
    expect(prompt).toMatch(/numeros relevantes.{0,60}contexto.{0,20}use-os/is);
  });

  it("still forbids inventing data not present in the context (protection preserved)", async () => {
    const buildPrompt = await importBuildPrompt();
    const prompt = buildPrompt("oi", VALID_CONTEXT);
    expect(prompt).toMatch(/nunca invente numeros.{0,120}contexto/is);
  });

  it("instructs saying explicitly what it can't conclude instead of guessing, when data is missing", async () => {
    const buildPrompt = await importBuildPrompt();
    const prompt = buildPrompt("oi", VALID_CONTEXT);
    expect(prompt).toMatch(/diga explicitamente o que voce nao consegue concluir/i);
  });

  it("instructs offering a practical, actionable recommendation with a brief reason — not a generic tip", async () => {
    const buildPrompt = await importBuildPrompt();
    const prompt = buildPrompt("O que está pesando mais?", VALID_CONTEXT);
    expect(prompt).toMatch(/explique brevemente o motivo/i);
    expect(prompt).toMatch(/pratico e acionavel/i);
    expect(prompt).toMatch(/nunca uma dica generica/i);
  });

  it("never lets high-risk financial guidance read as an absolute guarantee", async () => {
    const buildPrompt = await importBuildPrompt();
    const prompt = buildPrompt("oi", VALID_CONTEXT);
    expect(prompt).toMatch(/nao fale como se fosse certeza absoluta/i);
    expect(prompt).toMatch(/nao.{0,20}garantia/i);
  });

  it("forbids rigid headings like Resposta/Diagnóstico/Recomendação — the reply must read as conversation", async () => {
    const buildPrompt = await importBuildPrompt();
    const prompt = buildPrompt("oi", VALID_CONTEXT);
    expect(prompt).toMatch(/nao existe estrutura fixa obrigatoria/i);
    expect(prompt).not.toMatch(/diagnostico:/i);
  });

  it("keeps the Markdown/formatting protections — the app renders plain text only", async () => {
    const buildPrompt = await importBuildPrompt();
    const prompt = buildPrompt("oi", VALID_CONTEXT);
    expect(prompt).toMatch(/nao use markdown/i);
    expect(prompt).toMatch(/asteriscos/i);
    expect(prompt).toMatch(/listas com marcadores/i);
  });

  it("keeps the 'planejamento' handling instruction unchanged", async () => {
    const buildPrompt = await importBuildPrompt();
    const prompt = buildPrompt("oi", VALID_CONTEXT);
    expect(prompt).toMatch(/planejamento.{0,20}true.{0,80}previsao/is);
  });

  it("still embeds the financial context as-is, without adding or dropping fields", async () => {
    const buildPrompt = await importBuildPrompt();
    const prompt = buildPrompt("oi", VALID_CONTEXT);
    expect(prompt).toContain(JSON.stringify(VALID_CONTEXT, null, 2));
  });
});
