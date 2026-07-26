import { createFileRoute } from "@tanstack/react-router";

// Secure Gemini proxy — the API key stays server-side (never exposed to the front-end).
// Mirrors the original Netlify function contract: POST { question, context } -> { answer }.

export const Route = createFileRoute("/api/gemini-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = getGeminiApiKey();
        if (!apiKey) {
          return Response.json({ error: "GEMINI_API_KEY ou GEMINI_API nao configurada" }, { status: 500 });
        }
        const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

        try {
          const body = (await request.json()) as { question?: string; context?: unknown };
          const question = String(body.question || "").trim();
          const context = body.context || {};
          if (!question) return Response.json({ error: "Pergunta vazia" }, { status: 400 });

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: buildPrompt(question, context) }] }],
                generationConfig: { temperature: 0.35, maxOutputTokens: 700 },
              }),
            },
          );

          if (!response.ok) {
            const details = await response.text();
            console.error(`Gemini error [${response.status}]: ${details}`);
            return Response.json(
              { error: "Erro ao chamar Gemini", details: normalizeGeminiError(details), model },
              { status: response.status },
            );
          }

          const data = (await response.json()) as {
            candidates?: { content?: { parts?: { text?: string }[] } }[];
            promptFeedback?: { blockReason?: string };
          };
          const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n").trim();
          if (!raw && data?.promptFeedback?.blockReason) {
            return Response.json(
              { error: `Gemini bloqueou a resposta: ${data.promptFeedback.blockReason}`, model },
              { status: 502 },
            );
          }
          return Response.json({ answer: cleanAnswer(raw) || "Nao consegui gerar uma resposta agora." });
        } catch (error) {
          console.error(error);
          return Response.json({ error: "Erro inesperado" }, { status: 500 });
        }
      },
    },
  },
});

function getGeminiApiKey(): string {
  return String(process.env.GEMINI_API_KEY || process.env.GEMINI_API || "").trim();
}

function normalizeGeminiError(details: string): string {
  try {
    const data = JSON.parse(details) as { error?: { message?: string; status?: string } };
    return [data.error?.status, data.error?.message].filter(Boolean).join(": ") || details;
  } catch {
    return details.slice(0, 500);
  }
}

function buildPrompt(question: string, context: unknown): string {
  return `
Voce e o Aval, um assistente financeiro familiar em portugues do Brasil.
Atue como o maior especialista da area financeira para controle domestico, planejamento mensal, contas a pagar, prioridades, economia e tomada de decisao.
Sua postura deve ser profissional, clara, direta e consultiva.
Responda de forma curta, pratica e cuidadosa. Nao invente dados alem do contexto.
O app pode ter varios perfis financeiros. Use a visao informada no contexto financeiro atual.

Formato obrigatorio da resposta:
- Nao use Markdown.
- Nao use asteriscos.
- Nao use negrito.
- Nao use listas com marcadores.
- Use frases curtas e quebras de linha simples.
- Para valores, use linhas no formato "Orcamento: R$ 0,00".
- Termine com um resumo em 1 ou 2 frases.

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
