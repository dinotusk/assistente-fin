// Local cache of the Gemini consent gate, for instant UI checks without a network
// round trip. This is NOT the enforcement boundary — the server independently
// verifies consent against the `ai_consents` table on every request (see
// hasActiveConsent in routes/api/gemini-chat.ts), since a client-only flag can be
// bypassed by calling the API directly. Callers should treat FinanceContext's
// saveAiConsent/revokeAiConsent (which write to Supabase) as the source of truth
// and only use this module to mirror that state locally after a successful write.
const CONSENT_KEY = "aval:ai-consent:v1";

/** Bump when the consent copy/scope changes meaningfully — forces re-consent. */
export const AI_CONSENT_VERSION = 1;

interface ConsentRecord {
  accepted: boolean;
  acceptedAt: string | null;
}

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readRecord(): ConsentRecord | null {
  if (!hasWindow()) return null;
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
    if (typeof parsed.accepted !== "boolean") return null;
    return { accepted: parsed.accepted, acceptedAt: parsed.acceptedAt ?? null };
  } catch {
    return null;
  }
}

export function hasAiConsent(): boolean {
  return readRecord()?.accepted === true;
}

export function getAiConsentGrantedAt(): string | null {
  return readRecord()?.acceptedAt ?? null;
}

export function grantAiConsent(): void {
  if (!hasWindow()) return;
  const record: ConsentRecord = { accepted: true, acceptedAt: new Date().toISOString() };
  localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
}

export function revokeAiConsent(): void {
  if (!hasWindow()) return;
  localStorage.removeItem(CONSENT_KEY);
}
