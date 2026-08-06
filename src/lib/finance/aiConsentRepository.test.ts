import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  rpc: vi.fn(),
  from: vi.fn(),
};

vi.mock("../supabase/client", () => ({ supabase: mockSupabase }));

// Dynamic, not static: a static top-level import of supabaseRepository.ts would
// resolve its "../supabase/client" import before the mockSupabase declaration
// above finishes initializing (ES module imports evaluate before any other
// top-level statement), throwing a TDZ error inside the vi.mock factory.
const { getAiConsentStatus, revokeAiConsent, saveAiConsent } = await import("./supabaseRepository");

describe("AI consent repository — RPC-only writes, read-only select", () => {
  beforeEach(() => {
    mockSupabase.auth.getUser.mockReset();
    mockSupabase.rpc.mockReset();
    mockSupabase.from.mockReset();
  });

  it("saveAiConsent calls accept_ai_consent with no arguments — the client can never supply a version", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
    await saveAiConsent();
    expect(mockSupabase.rpc).toHaveBeenCalledWith("accept_ai_consent");
    expect(mockSupabase.rpc.mock.calls[0]).toHaveLength(1);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("revokeAiConsent calls revoke_ai_consent with no arguments — the client can never target another user", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
    await revokeAiConsent();
    expect(mockSupabase.rpc).toHaveBeenCalledWith("revoke_ai_consent");
    expect(mockSupabase.rpc.mock.calls[0]).toHaveLength(1);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("saveAiConsent surfaces an RPC error instead of swallowing it", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: new Error("boom") });
    await expect(saveAiConsent()).rejects.toThrow("boom");
  });

  it("revokeAiConsent surfaces an RPC error instead of swallowing it", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: new Error("boom") });
    await expect(revokeAiConsent()).rejects.toThrow("boom");
  });

  it("getAiConsentStatus only ever reads (never calls rpc), relying on RLS to scope to the caller's own row", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { consent_version: 1, accepted_at: "2026-08-01T00:00:00Z", revoked_at: null },
        error: null,
      }),
    };
    mockSupabase.from.mockReturnValue(query);
    const status = await getAiConsentStatus();
    expect(status).toEqual({ granted: true, acceptedAt: "2026-08-01T00:00:00Z" });
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
    // No .eq(...) call at all — no client-supplied filter, RLS does the scoping.
    expect(query).not.toHaveProperty("eq");
  });

  it("getAiConsentStatus treats a revoked row as not granted", async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          consent_version: 1,
          accepted_at: "2026-08-01T00:00:00Z",
          revoked_at: "2026-08-02T00:00:00Z",
        },
        error: null,
      }),
    });
    const status = await getAiConsentStatus();
    expect(status).toEqual({ granted: false, acceptedAt: null });
  });

  it("getAiConsentStatus treats an out-of-date consent_version as not granted", async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { consent_version: 0, accepted_at: "2026-08-01T00:00:00Z", revoked_at: null },
        error: null,
      }),
    });
    const status = await getAiConsentStatus();
    expect(status).toEqual({ granted: false, acceptedAt: null });
  });
});
