import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

describe("aiConsent", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("has no consent by default", async () => {
    const { hasAiConsent } = await import("./aiConsent");
    expect(hasAiConsent()).toBe(false);
  });

  it("grants consent and records a timestamp", async () => {
    const { grantAiConsent, hasAiConsent, getAiConsentGrantedAt } = await import("./aiConsent");
    grantAiConsent();
    expect(hasAiConsent()).toBe(true);
    expect(getAiConsentGrantedAt()).not.toBeNull();
  });

  it("revoking clears consent", async () => {
    const { grantAiConsent, revokeAiConsent, hasAiConsent } = await import("./aiConsent");
    grantAiConsent();
    expect(hasAiConsent()).toBe(true);
    revokeAiConsent();
    expect(hasAiConsent()).toBe(false);
  });

  it("ignores a corrupted stored record instead of throwing", async () => {
    localStorage.setItem("aval:ai-consent:v1", "not json");
    const { hasAiConsent } = await import("./aiConsent");
    expect(hasAiConsent()).toBe(false);
  });
});

describe("askGemini consent gate", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("throws and never calls fetch when consent has not been granted", async () => {
    const { askGemini } = await import("./ai");
    await expect(askGemini("Quanto falta pagar?", {})).rejects.toThrow(
      "Consentimento de IA necessario",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("proceeds past the consent check once granted (fails later on invalid context, not on consent)", async () => {
    const { grantAiConsent } = await import("./aiConsent");
    grantAiConsent();
    const { askGemini } = await import("./ai");
    // Malformed context on purpose — this asserts the failure is a validation
    // error, not the consent error, proving the gate let it through.
    await expect(askGemini("Quanto falta pagar?", { notTheRealShape: true })).rejects.toThrow(
      "Contexto financeiro invalido",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("P0-05B round 2.1 — consent version bump touches nothing about the AI context contract", () => {
  it("AI_CONSENT_VERSION is 2, decoupled from the context allowlist/classifier", async () => {
    const { AI_CONSENT_VERSION } = await import("./aiConsent");
    expect(AI_CONSENT_VERSION).toBe(2);
  });

  it("classifyAiIntent/buildAiContext still produce exactly the pinned per-intent shapes", async () => {
    const { buildAiContext, classifyAiIntent } = await import("./ai");
    const state = {
      people: ["Maria"],
      activePerson: "me",
      activeMonth: "2026-08",
      months: {
        "2026-08": {
          label: "Agosto 2026",
          income: 5000,
          houseContribution: 0,
          expenses: [],
          priorities: [],
        },
      },
    };
    expect(classifyAiIntent("Quanto ainda posso gastar?")).toBe("BALANCE");
    const context = buildAiContext(state, "BALANCE");
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

  it("the validation caps (question length, item count, category cap, body size) are unchanged", async () => {
    const validation = await import("./aiRequestValidation");
    expect(validation.MAX_QUESTION_LENGTH).toBe(2000);
    expect(validation.MAX_CONTEXT_ITEMS).toBe(12);
    expect(validation.MAX_AI_CATEGORY_ITEMS).toBe(13);
    expect(validation.MAX_CONTEXT_TEXT_LENGTH).toBe(120);
    expect(validation.MAX_BODY_BYTES).toBe(24_000);
  });

  it("gemini-chat.ts source still pins generationConfig and the round-1 prompt guarantees verbatim", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(__dirname, "../../routes/api/gemini-chat.ts"), "utf8");
    expect(source).toMatch(/maxOutputTokens:\s*2048/);
    expect(source).toMatch(/thinkingBudget:\s*1024/);
    expect(source).toMatch(/Nunca invente numeros/i);
    expect(source).toMatch(/Nao use Markdown/i);
  });
});
