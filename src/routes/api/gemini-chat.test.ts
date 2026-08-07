import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  mes: "Agosto de 2026",
  planejamento: false,
  visao: "Tudo",
  orcamento: 5000,
  totalGasto: 1200,
  pendente: 300,
  pago: 900,
  saldoRestante: 3800,
  maiorCategoria: null,
  gastos: [],
  prioridades: [],
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

function mockActiveConsent() {
  mockSupabase.from.mockReturnValue(
    makeConsentQuery({
      data: { consent_version: 1, accepted_at: "2026-08-01T00:00:00Z", revoked_at: null },
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
});
