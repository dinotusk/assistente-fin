import { supabase } from "../supabase/client";

/**
 * Thin, explicit client for the Aval backend (Spring Boot, currently on Railway staging —
 * see docs/architecture/backend-staging.md). Distinct from ../supabase/client.ts on purpose:
 * this backend has no concept of RLS or a service-role key, only a Supabase JWT it validates
 * itself (see backend SecurityConfig). No secret of any kind lives in this file — the access
 * token is read fresh from the current Supabase session on every call, never persisted or
 * logged, and the API base URL is public by design (it's just the backend's HTTPS origin).
 */

/**
 * Every error this client can throw. `status` is the real HTTP status; `type`/`requestId`
 * mirror the backend's own ApiErrorResponse shape when the body parsed as JSON — both are
 * undefined for a raw network failure or an unparseable error body, never guessed.
 */
export class BackendApiError extends Error {
  readonly status: number;
  readonly type?: string;
  readonly requestId?: string;

  constructor(message: string, status: number, type?: string, requestId?: string) {
    super(message);
    this.name = "BackendApiError";
    this.status = status;
    this.type = type;
    this.requestId = requestId;
  }
}

/** Strips a trailing slash so `${base}${path}` never produces a doubled "//". */
function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * Reads VITE_API_BASE_URL lazily (not at module load) so a missing/blank value fails with a
 * clear, catchable error exactly when a call is attempted, not as a silent `undefined` baked
 * into a request URL.
 */
function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (!raw || !raw.trim()) {
    throw new BackendApiError("VITE_API_BASE_URL nao configurada", 0);
  }
  return normalizeBaseUrl(raw.trim());
}

/** Never returns a stale/cached token — reads the live Supabase session on every call. */
async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new BackendApiError("Sessao nao encontrada", 401);
  }
  return token;
}

interface BackendErrorBody {
  type?: string;
  message?: string;
  requestId?: string;
}

/** Best-effort JSON parse — a non-JSON or empty error body must never throw past this point. */
async function parseErrorBody(response: Response): Promise<BackendErrorBody> {
  try {
    return (await response.json()) as BackendErrorBody;
  } catch {
    return {};
  }
}

/**
 * POST helper shared by every backend call this client makes. Always sends a fresh bearer
 * token and JSON content type; never retries, never caches, never logs the token or the
 * response body (callers decide what, if anything, is safe to log).
 */
async function authorizedPost<T>(path: string, body: unknown): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const token = await getAccessToken();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch (networkError) {
    throw new BackendApiError(
      networkError instanceof Error ? networkError.message : "Falha de rede",
      0,
    );
  }

  if (!response.ok) {
    const errorBody = await parseErrorBody(response);
    throw new BackendApiError(
      errorBody.message || "Erro no backend",
      response.status,
      errorBody.type,
      errorBody.requestId,
    );
  }

  return (await response.json()) as T;
}

/** Mirrors the backend's AssistantResponse record — see AssistantController. */
export interface AssistantMessageResponse {
  answer: string;
  conversationId: string;
  requestId: string;
  toolsUsed: string[];
  generatedAt: string;
}

/** POST /api/v1/assistant/messages — see AssistantController/AssistantRequest. */
export async function sendAssistantMessage(message: string): Promise<AssistantMessageResponse> {
  return authorizedPost<AssistantMessageResponse>("/api/v1/assistant/messages", { message });
}

/** Mirrors the backend's SimulatePurchaseResponse — see SimulatePurchaseController. */
export interface SimulatePurchaseResponse {
  purchaseAmount: string;
  installments: number;
  installmentSchedule: string[];
  currentBudget: string;
  currentTotal: string;
  currentFree: string;
  projectedTotal: string;
  projectedFree: string;
  status: "FEASIBLE" | "WARNING" | "NOT_FEASIBLE";
  assumptions: string[];
  warnings: string[];
}

export interface SimulatePurchaseRequest {
  month: string;
  scope: "me" | "household" | "profile";
  /** Only meaningful (and only sent) when scope is "profile". */
  profileId?: string;
  /** Decimal string, scale 2 (e.g. "1500.00") — never a raw JS number, see SimulationLimits. */
  purchaseAmount: string;
  installments?: number;
}

/** POST /api/v1/tools/simulate-purchase — see SimulatePurchaseController/SimulatePurchaseTool. */
export async function simulatePurchase(
  request: SimulatePurchaseRequest,
): Promise<SimulatePurchaseResponse> {
  return authorizedPost<SimulatePurchaseResponse>("/api/v1/tools/simulate-purchase", request);
}
