// Device-local consent gate for the Gemini assistant. Deliberately not synced to
// Supabase: this governs what leaves *this* client, not a server-side secret, so
// there's nothing a shared/remote record would protect that localStorage doesn't
// already cover for a single device.
const CONSENT_KEY = "aval:ai-consent:v1";

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
