import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

import { AI_CONSENT_VERSION } from "@/lib/finance/aiConsent";
import { MAX_BODY_BYTES, validateAiChatRequest } from "@/lib/finance/aiRequestValidation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = SupabaseClient<any, any, any, any, any>;

// Secure Gemini proxy — the API key stays server-side (never exposed to the front-end).
// Mirrors the original Netlify function contract: POST { question, context } -> { answer }.

const RATE_LIMIT_WINDOW_SECONDS = 5 * 60;
const RATE_LIMIT_MAX_REQUESTS = 20;
const GEMINI_TIMEOUT_MS = 15_000;

// Every error surfaced to the client is one of these fixed, safe strings — never
// upstream response bodies, stack traces, config state, or internal URLs/keys.
// Anything with real diagnostic value goes to console.error only (server logs).
const CLIENT_ERRORS = {
  unauthorized: "Sessao invalida ou expirada",
  badJson: "Corpo da requisicao invalido",
  payloadTooLarge: "Requisicao excede o tamanho maximo permitido",
  consentRequired: "Consentimento de IA necessario ou desatualizado",
  rateLimited: "Muitas perguntas em pouco tempo. Aguarde alguns minutos e tente novamente.",
  unavailable: "Assistente de IA indisponivel no momento",
  timeout: "Tempo de resposta excedido. Tente novamente.",
  blocked: "Nao consegui gerar uma resposta para essa pergunta.",
  unexpected: "Erro inesperado. Tente novamente.",
} as const;

/**
 * The user id used for consent AND rate limiting always comes from this — the
 * verified JWT subject — never from the request body. validateAiChatRequest also
 * rejects any unrecognized field, so a client can't smuggle an alternate user id
 * through the payload even if this function's result were bypassed some other way.
 */
async function getAuthenticatedUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://cvsefuukfmdfaajjlpmi.supabase.co";
  const supabaseKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_ICGu3_4a2BKUlI2DjyT94Q_VvQEwd5g";
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * Service-role client for the two checks below — never exposed to, or reachable
 * from, the client bundle. SUPABASE_SECRET_KEY is the official Vercel<->Supabase
 * integration's name for this credential and is preferred; SUPABASE_SERVICE_ROLE_KEY
 * is kept as a temporary fallback for environments still using the older manual
 * setup (see .env.example).
 */
function getServiceRoleClient(): SupabaseAdmin | null {
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) return null;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://cvsefuukfmdfaajjlpmi.supabase.co";
  return createClient(supabaseUrl, secretKey);
}

interface ConsentRow {
  consent_version: number;
  accepted_at: string | null;
  revoked_at: string | null;
}

/**
 * The real enforcement point for consent — a client-side localStorage flag (see
 * aiConsent.ts) can't be trusted since it's trivially bypassed by calling this
 * route directly. Fails closed: missing row, revoked, no accepted_at, an
 * out-of-date consent_version, or a DB error all count as "not consented."
 */
async function hasActiveConsent(userId: string): Promise<boolean> {
  const admin = getServiceRoleClient();
  if (!admin) {
    console.error(
      "Consent check skipped: SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY nao configurada",
    );
    return false;
  }
  const { data, error } = await admin
    .from("ai_consents")
    .select("consent_version, accepted_at, revoked_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("AI consent check failed:", error.message);
    return false;
  }
  const row = data as ConsentRow | null;
  if (!row || !row.accepted_at || row.revoked_at) return false;
  return row.consent_version >= AI_CONSENT_VERSION;
}

/** True if allowed to proceed; false once the window's request budget is used up. Fails closed on any DB error. */
async function checkRateLimit(userId: string): Promise<boolean> {
  const admin = getServiceRoleClient();
  if (!admin) {
    console.error(
      "Rate limit check skipped: SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY nao configurada",
    );
    return false;
  }
  const { data, error } = await admin.rpc("check_and_log_ai_rate_limit", {
    p_user_id: userId,
    p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    p_max_requests: RATE_LIMIT_MAX_REQUESTS,
  });
  if (error) {
    console.error("Rate limit RPC failed:", error.message);
    return false;
  }
  return data === true;
}

function getGeminiApiKey(): string {
  return String(process.env.GEMINI_API_KEY || process.env.GEMINI_API || "").trim();
}

/** Extracted for testability — the route below just delegates to this. */
export async function handleGeminiChatRequest(request: Request): Promise<Response> {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return Response.json({ error: CLIENT_ERRORS.unauthorized }, { status: 401 });
  }

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader && Number(contentLengthHeader) > MAX_BODY_BYTES) {
    return Response.json({ error: CLIENT_ERRORS.payloadTooLarge }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return Response.json({ error: CLIENT_ERRORS.payloadTooLarge }, { status: 413 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: CLIENT_ERRORS.badJson }, { status: 400 });
  }

  const validated = validateAiChatRequest(parsedBody);
  if (!validated.ok) {
    return Response.json({ error: validated.error }, { status: 400 });
  }
  const { question, context } = validated.value;

  const consented = await hasActiveConsent(userId);
  if (!consented) {
    return Response.json({ error: CLIENT_ERRORS.consentRequired }, { status: 403 });
  }

  const allowed = await checkRateLimit(userId);
  if (!allowed) {
    return Response.json({ error: CLIENT_ERRORS.rateLimited }, { status: 429 });
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    console.error("GEMINI_API_KEY/GEMINI_API nao configurada");
    return Response.json({ error: CLIENT_ERRORS.unavailable }, { status: 500 });
  }
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: buildPrompt(question, context) }] }],
          generationConfig: { temperature: 0.35, maxOutputTokens: 700 },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      console.error(`Gemini error [${response.status}]:`, details);
      return Response.json({ error: CLIENT_ERRORS.unavailable }, { status: 502 });
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      promptFeedback?: { blockReason?: string };
    };
    const raw = data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("\n")
      .trim();
    if (!raw && data?.promptFeedback?.blockReason) {
      console.error("Gemini blocked the response:", data.promptFeedback.blockReason);
      return Response.json({ error: CLIENT_ERRORS.blocked }, { status: 502 });
    }
    return Response.json({
      answer: cleanAnswer(raw) || "Nao consegui gerar uma resposta agora.",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return Response.json({ error: CLIENT_ERRORS.timeout }, { status: 504 });
    }
    console.error("Gemini request failed:", error instanceof Error ? error.message : String(error));
    return Response.json({ error: CLIENT_ERRORS.unexpected }, { status: 500 });
  } finally {
    clearTimeout(timeoutId);
  }
}

export const Route = createFileRoute("/api/gemini-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => handleGeminiChatRequest(request),
    },
  },
});

/** Extracted for testability — asserts on the contract (which instructions are present), never on literal Gemini output. */
export function buildPrompt(question: string, context: unknown): string {
  return `
Voce e o Aval, o assistente financeiro de confianca desta familia. Fale portugues do Brasil natural, como alguem que entende de dinheiro e esta conversando de verdade — calmo, confiavel e direto. Nunca soe como um relatorio bancario frio, e nunca faca sermao sobre gastos.

Regras de conteudo:
- Responda primeiro, diretamente, a pergunta feita. So depois acrescente contexto, se ajudar a resposta.
- Adapte a profundidade da resposta ao tipo de pergunta: uma pergunta objetiva merece uma resposta curta; um pedido de analise, ou uma pergunta que envolve decisao, merece uma resposta mais desenvolvida, com o raciocinio explicado.
- Sempre que houver numeros relevantes no contexto financeiro, use-os. Nunca responda em termos vagos se o dado concreto existe no contexto.
- Nunca invente numeros, contas, categorias ou fatos que nao estejam no contexto. Se faltar informacao para responder com seguranca, diga explicitamente o que voce nao consegue concluir, em vez de supor.
- Deixe claro o que e fato do contexto financeiro e o que e sua sugestao ou opiniao — nao misture os dois como se fossem a mesma coisa.
- Quando fizer uma recomendacao, explique brevemente o motivo, e ofereca algo pratico e acionavel quando fizer sentido — nunca uma dica generica.
- Para decisoes financeiras de maior risco (investimentos, dividas, renegociacoes), nao fale como se fosse certeza absoluta nem faca promessa financeira alguma; deixe claro que e uma orientacao, nao uma garantia.
- O app pode ter varios perfis financeiros. Use a visao informada no contexto financeiro atual.
- Se "planejamento" for true no contexto, o mes ainda nao comecou: trate os valores como previsao/orcamento planejado, nao como gastos ja realizados.

Formato da resposta (o app nao renderiza Markdown, entao siga estas regras a risca):
- Nao use Markdown, asteriscos, negrito ou listas com marcadores.
- Escreva em paragrafos corridos, com quebras de linha simples quando precisar separar ideias.
- Para valores, use o formato "Orcamento: R$ 0,00" quando fizer sentido apresentar assim.
- Nao force um resumo final em toda resposta — feche naturalmente; so recapitule se a resposta foi longa o suficiente para precisar.
- Nao existe estrutura fixa obrigatoria (nada de titulos como "Resposta" ou "Recomendacao") — a resposta deve fluir como uma conversa, nunca como um formulario.

Contexto financeiro atual:
${JSON.stringify(context, null, 2)}

Pergunta do usuario:
${question}
`.trim();
}

function cleanAnswer(answer = ""): string {
  return answer
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
