import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabase = {
  auth: { getSession: vi.fn() },
};
vi.mock("../supabase/client", () => ({ supabase: mockSupabase }));

// Dynamic import: a static one would resolve before the mock above finishes initializing.
const { BackendApiError, sendAssistantMessage, simulatePurchase } = await import("./backendClient");

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

describe("sendAssistantMessage — context hints (P7.1)", () => {
  function stubResponse() {
    mockFetchOnce(200, {
      answer: "ok",
      conversationId: "c1",
      requestId: "r1",
      toolsUsed: [],
      generatedAt: "2026-08-28T00:00:00Z",
    });
  }

  it("no hints -> body is exactly { message }, unchanged from before P7.1", async () => {
    stubResponse();
    await sendAssistantMessage("Análise do mês");
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({ message: "Análise do mês" });
  });

  it("household hints -> body includes month + scope=household", async () => {
    stubResponse();
    await sendAssistantMessage("Análise do mês", { month: "2026-07", scope: "household" });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({
      message: "Análise do mês",
      month: "2026-07",
      scope: "household",
    });
  });

  it("me hints -> body includes month + scope=me", async () => {
    stubResponse();
    await sendAssistantMessage("Meu limite", { month: "2026-07", scope: "me" });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({
      message: "Meu limite",
      month: "2026-07",
      scope: "me",
    });
  });

  it("undefined hint fields never enter the body, even when the hints object itself is passed", async () => {
    stubResponse();
    await sendAssistantMessage("oi", { month: "2026-07" });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ message: "oi", month: "2026-07" });
    expect(body).not.toHaveProperty("scope");
    expect(body).not.toHaveProperty("profileId");
  });

  it("profileId is only sent when explicitly provided", async () => {
    stubResponse();
    await sendAssistantMessage("oi", {
      month: "2026-07",
      scope: "profile",
      profileId: "11111111-1111-1111-1111-111111111111",
    });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({
      message: "oi",
      month: "2026-07",
      scope: "profile",
      profileId: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("Authorization/Content-Type headers are unaffected by hints", async () => {
    stubResponse();
    await sendAssistantMessage("oi", { month: "2026-07", scope: "household" });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token-123");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("existing error handling (403) is unaffected by hints being present", async () => {
    mockFetchOnce(403, { type: "ACCESS_DENIED", message: "Consentimento necessario." });
    await expect(
      sendAssistantMessage("oi", { month: "2026-07", scope: "household" }),
    ).rejects.toMatchObject({ status: 403, type: "ACCESS_DENIED" });
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

describe("simulatePurchase — request shape", () => {
  // P8.1 — the real backend wire shape: every money field is a {value, provenance} object
  // (see SimulatePurchaseResponse.java's MoneyValue/AssumptionValue/WarningValue records),
  // confirmed via a live DevTools capture — not the bare-string shape this mock assumed before.
  function money(value: string, provenance: "INPUT" | "CALCULATED" = "CALCULATED") {
    return { value, provenance };
  }

  function mockResponse() {
    return {
      isHypothetical: true,
      purchaseAmount: money("1500.00", "INPUT"),
      installments: 1,
      installmentSchedule: [money("1500.00")],
      currentBudget: money("5000.00"),
      currentTotal: money("1000.00"),
      currentFree: money("4000.00"),
      projectedTotal: money("2500.00"),
      projectedFree: money("2500.00"),
      status: "FEASIBLE" as const,
      assumptions: [
        { code: "HYPOTHETICAL_SCENARIO", description: "Cenario hipotetico." },
        { code: "NO_INTEREST_INSTALLMENTS", description: "Sem juros." },
      ],
      warnings: [],
    };
  }

  it("posts to /api/v1/tools/simulate-purchase with month/scope/purchaseAmount", async () => {
    mockFetchOnce(200, mockResponse());

    await simulatePurchase({ month: "2026-08", scope: "household", purchaseAmount: "1500.00" });

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://backend.example/api/v1/tools/simulate-purchase");
    expect(JSON.parse(init.body as string)).toEqual({
      month: "2026-08",
      scope: "household",
      purchaseAmount: "1500.00",
    });
  });

  it("uses the same Authorization mechanism as sendAssistantMessage", async () => {
    mockFetchOnce(200, mockResponse());
    await simulatePurchase({ month: "2026-08", scope: "me", purchaseAmount: "10.00" });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token-123");
  });

  it("sends scope=household as-is", async () => {
    mockFetchOnce(200, mockResponse());
    await simulatePurchase({ month: "2026-08", scope: "household", purchaseAmount: "10.00" });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string).scope).toBe("household");
  });

  it("sends scope=me as-is", async () => {
    mockFetchOnce(200, mockResponse());
    await simulatePurchase({ month: "2026-08", scope: "me", purchaseAmount: "10.00" });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string).scope).toBe("me");
  });

  it("sends purchaseAmount as a scale-2 decimal string, never a raw number", async () => {
    mockFetchOnce(200, mockResponse());
    await simulatePurchase({ month: "2026-08", scope: "household", purchaseAmount: "1234.50" });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.purchaseAmount).toBe("1234.50");
    expect(typeof body.purchaseAmount).toBe("string");
  });

  it("resolves the typed response on 200", async () => {
    mockFetchOnce(200, mockResponse());
    const result = await simulatePurchase({
      month: "2026-08",
      scope: "household",
      purchaseAmount: "1500.00",
    });
    expect(result.status).toBe("FEASIBLE");
    expect(result.projectedFree.value).toBe("2500.00");
    expect(result.projectedFree.provenance).toBe("CALCULATED");
  });

  it("classifies a 400 (validation) as a BackendApiError", async () => {
    mockFetchOnce(400, {
      type: "VALIDATION_ERROR",
      message: "purchaseAmount deve ser maior que zero.",
    });
    await expect(
      simulatePurchase({ month: "2026-08", scope: "household", purchaseAmount: "0.00" }),
    ).rejects.toMatchObject({ status: 400, type: "VALIDATION_ERROR" });
  });

  it("classifies a 401 as a BackendApiError", async () => {
    mockFetchOnce(401, { type: "AUTHENTICATION_REQUIRED", message: "Autenticacao necessaria." });
    await expect(
      simulatePurchase({ month: "2026-08", scope: "household", purchaseAmount: "10.00" }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("classifies a 403 as a BackendApiError", async () => {
    mockFetchOnce(403, { type: "ACCESS_DENIED", message: "Acesso negado." });
    await expect(
      simulatePurchase({ month: "2026-08", scope: "household", purchaseAmount: "10.00" }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("classifies a 429 as a BackendApiError", async () => {
    mockFetchOnce(429, { type: "RATE_LIMITED", message: "Muitas perguntas." });
    await expect(
      simulatePurchase({ month: "2026-08", scope: "household", purchaseAmount: "10.00" }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("classifies a 5xx as a BackendApiError", async () => {
    mockFetchOnce(500, { type: "INTERNAL_ERROR", message: "Erro interno." });
    await expect(
      simulatePurchase({ month: "2026-08", scope: "household", purchaseAmount: "10.00" }),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("classifies a raw network failure as a BackendApiError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(
      simulatePurchase({ month: "2026-08", scope: "household", purchaseAmount: "10.00" }),
    ).rejects.toBeInstanceOf(BackendApiError);
  });
});
