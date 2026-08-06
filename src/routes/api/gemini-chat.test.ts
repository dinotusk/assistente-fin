import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_BODY_BYTES } from "@/lib/finance/aiRequestValidation";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  rpc: vi.fn(),
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

async function importHandler() {
  const mod = await import("./gemini-chat");
  return mod.handleGeminiChatRequest;
}

describe("handleGeminiChatRequest", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabase.auth.getUser.mockReset();
    mockSupabase.rpc.mockReset();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("GEMINI_API_KEY", "gemini-key");
    vi.stubGlobal("fetch", vi.fn());
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
    // Never even reached auth-dependent rate limiting for this oversized body.
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
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
    mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
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
    mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
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
    mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
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
    mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
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
