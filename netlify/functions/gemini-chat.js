const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Metodo nao permitido" });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API;
  if (!apiKey) {
    return jsonResponse(500, { error: "GEMINI_API_KEY ou GEMINI_API nao configurada no Netlify" });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const question = String(body.question || "").trim();
    const context = body.context || {};
    if (!question) return jsonResponse(400, { error: "Pergunta vazia" });

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(question, context) }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 700 },
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      return jsonResponse(response.status, { error: "Erro ao chamar Gemini", details });
    }

    const data = await response.json();
    const answer = cleanAnswer(data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim());
    return jsonResponse(200, { answer: answer || "Nao consegui gerar uma resposta agora." });
  } catch (error) {
    return jsonResponse(500, { error: error.message || "Erro inesperado" });
  }
};

function buildPrompt(question, context) {
  return `
Voce e um assistente financeiro familiar em portugues do Brasil.
Atue como o maior especialista da area financeira para controle domestico, planejamento mensal, contas a pagar, prioridades, economia e tomada de decisao.
Sua postura deve ser profissional, clara, direta e consultiva, como alguem que entende profundamente organizacao financeira familiar.
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

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(payload),
  };
}
