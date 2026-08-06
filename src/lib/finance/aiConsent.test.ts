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
