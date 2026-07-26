const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Metodo nao permitido" });
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return response.status(500).json({ error: "GEMINI_API_KEY ou GEMINI_API nao configurada" });
  }

  try {
    const body = request.body || {};
    const question = String(body.question || "").trim();
    const context = body.context || {};
    if (!question) return response.status(400).json({ error: "Pergunta vazia" });

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: buildPrompt(question, context) }] }],
          generationConfig: { temperature: 0.35, maxOutputTokens: 700 },
        }),
      },
    );

    if (!geminiResponse.ok) {
      const details = await geminiResponse.text();
      return response
        .status(geminiResponse.status)
        .json({ error: "Erro ao chamar Gemini", details: normalizeGeminiError(details), model: GEMINI_MODEL });
    }

    const data = await geminiResponse.json();
    const answer = cleanAnswer(data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim());
    if (!answer && data?.promptFeedback?.blockReason) {
      return response
        .status(502)
        .json({ error: `Gemini bloqueou a resposta: ${data.promptFeedback.blockReason}`, model: GEMINI_MODEL });
    }
    return response.status(200).json({ answer: answer || "Nao consegui gerar uma resposta agora." });
  } catch (error) {
    return response.status(500).json({ error: error.message || "Erro inesperado" });
  }
}

function getGeminiApiKey() {
  return String(process.env.GEMINI_API_KEY || process.env.GEMINI_API || "").trim();
}

function normalizeGeminiError(details) {
  try {
    const data = JSON.parse(details);
    return [data?.error?.status, data?.error?.message].filter(Boolean).join(": ") || details;
  } catch {
    return String(details).slice(0, 500);
  }
}

function buildPrompt(question, context) {
  return `
Voce e o Aval, um assistente financeiro familiar em portugues do Brasil.
Atue como o maior especialista da area financeira para controle domestico, planejamento mensal, contas a pagar, prioridades, economia e tomada de decisao.
Sua postura deve ser profissional, clara, direta e consultiva.
Responda de forma curta, pratica e cuidadosa. Nao invente dados alem do contexto.

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

function cleanAnswer(answer = "") {
  return answer
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
