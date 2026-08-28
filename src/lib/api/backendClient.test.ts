import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabase = {
  auth: { getSession: vi.fn() },
};
vi.mock("../supabase/client", () => ({ supabase: mockSupabase }));

// Dynamic import: a static one would resolve before the mock above finishes initializing.
const { BackendApiError, sendAssistantMessage } = await import("./backendClient");

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}

function mockFetchNonJsonOnce(status: number) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status })));
}

beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", "https://backend.example");
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: "token-123" } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("sendAssistantMessage — session/auth", () => {
  it("throws a 401 BackendApiError, never calling fetch, when there is no active session", async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    vi.stubGlobal("fetch", vi.fn());

    await expect(sendAssistantMessage("oi")).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never lets the access token leak into a thrown error's message", async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: "super-secret-token-xyz" } },
    });
    mockFetchOnce(500, { message: "Erro interno" });

    const result = sendAssistantMessage("oi");
    await expect(result).rejects.not.toMatchObject({
      message: expect.stringContaining("super-secret-token-xyz"),
    });
  });
});

describe("sendAssistantMessage — base URL", () => {
  it("throws a clear, catchable error when VITE_API_BASE_URL is unset", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    await expect(sendAssistantMessage("oi")).rejects.toBeInstanceOf(BackendApiError);
  });

  it("strips a trailing slash so the request path never becomes '//api/...'", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://backend.example/");
    mockFetchOnce(200, {
      answer: "ok",
      conversationId: "c1",
      requestId: "r1",
      toolsUsed: [],
      generatedAt: "2026-08-28T00:00:00Z",
    });

    await sendAssistantMessage("oi");

    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toBe("https://backend.example/api/v1/assistant/messages");
  });
});

describe("sendAssistantMessage — request shape", () => {
  it("sends Authorization: Bearer <token> and Content-Type: application/json", async () => {
    mockFetchOnce(200, {
      answer: "ok",
      conversationId: "c1",
      requestId: "r1",
      toolsUsed: [],
      generatedAt: "2026-08-28T00:00:00Z",
    });

    await sendAssistantMessage("Qual meu saldo?");

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token-123");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ message: "Qual meu saldo?" });
  });
});

describe("sendAssistantMessage — response handling", () => {
  it("parses a clean 200 into the typed response", async () => {
    mockFetchOnce(200, {
      answer: "Voce esta dentro do orcamento.",
      conversationId: "c1",
      requestId: "r1",
      toolsUsed: ["get_financial_summary"],
      generatedAt: "2026-08-28T00:00:00Z",
    });

    const result = await sendAssistantMessage("oi");
    expect(result.answer).toBe("Voce esta dentro do orcamento.");
    expect(result.toolsUsed).toEqual(["get_financial_summary"]);
  });

  it("classifies a 403 (AiConsentGate) as a BackendApiError carrying status/type", async () => {
    mockFetchOnce(403, {
      type: "ACCESS_DENIED",
      message: "Consentimento de IA necessario ou desatualizado.",
      requestId: "r1",
      details: [],
    });

    await expect(sendAssistantMessage("oi")).rejects.toMatchObject({
      status: 403,
      type: "ACCESS_DENIED",
    });
  });

  it("classifies a 429 (AiRateLimiter) as a BackendApiError", async () => {
    mockFetchOnce(429, {
      type: "RATE_LIMITED",
      message: "Muitas perguntas em pouco tempo.",
      requestId: "r1",
      details: [],
    });

    await expect(sendAssistantMessage("oi")).rejects.toMatchObject({
      status: 429,
      type: "RATE_LIMITED",
    });
  });

  it("classifies a 5xx JSON error body as a BackendApiError", async () => {
    mockFetchOnce(502, {
      type: "EXTERNAL_SERVICE_ERROR",
      message: "Assistente indisponivel no momento.",
      requestId: "r1",
      details: [],
    });

    await expect(sendAssistantMessage("oi")).rejects.toMatchObject({
      status: 502,
      type: "EXTERNAL_SERVICE_ERROR",
    });
  });

  it("survives a non-JSON error body with a safe generic message instead of throwing a parse error", async () => {
    mockFetchNonJsonOnce(500);

    await expect(sendAssistantMessage("oi")).rejects.toBeInstanceOf(BackendApiError);
    await expect(sendAssistantMessage("oi")).rejects.toMatchObject({ status: 500 });
  });

  it("classifies a raw network failure (fetch throws) as a BackendApiError, not an unhandled rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(sendAssistantMessage("oi")).rejects.toBeInstanceOf(BackendApiError);
  });
});
