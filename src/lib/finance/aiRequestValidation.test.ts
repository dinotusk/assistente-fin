import { describe, expect, it } from "vitest";

import {
  MAX_CONTEXT_ITEMS,
  MAX_QUESTION_LENGTH,
  validateAiChatRequest,
  type AiChatContext,
} from "./aiRequestValidation";

function makeContext(overrides: Partial<AiChatContext> = {}): AiChatContext {
  return {
    mes: "Agosto de 2026",
    planejamento: false,
    visao: "Tudo",
    orcamento: 5000,
    totalGasto: 1200,
    pendente: 300,
    pago: 900,
    saldoRestante: 3800,
    maiorCategoria: { category: "Casa", total: 600 },
    gastos: [],
    prioridades: [],
    ...overrides,
  };
}

describe("validateAiChatRequest", () => {
  it("accepts a well-formed request", () => {
    const result = validateAiChatRequest({
      question: "Quanto falta pagar?",
      context: makeContext(),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an empty question", () => {
    const result = validateAiChatRequest({ question: "   ", context: makeContext() });
    expect(result).toEqual({ ok: false, error: "Pergunta vazia" });
  });

  it("rejects a question over the max length", () => {
    const result = validateAiChatRequest({
      question: "a".repeat(MAX_QUESTION_LENGTH + 1),
      context: makeContext(),
    });
    expect(result).toEqual({ ok: false, error: "Pergunta muito longa" });
  });

  it("rejects unknown top-level fields (e.g. a smuggled history array)", () => {
    const result = validateAiChatRequest({
      question: "oi",
      context: makeContext(),
      history: [{ role: "user", text: "oi" }],
    });
    expect(result).toEqual({ ok: false, error: "Requisicao invalida" });
  });

  it("rejects a context with unknown fields", () => {
    const context = { ...makeContext(), userEmail: "a@b.com" };
    const result = validateAiChatRequest({ question: "oi", context });
    expect(result).toEqual({ ok: false, error: "Contexto financeiro invalido" });
  });

  it("rejects gastos beyond the item cap", () => {
    const entry = {
      descricao: "Mercado",
      categoria: "Casa",
      valor: 100,
      status: "Pago",
      responsavel: "Maria",
      data: "2026-08-01",
      pagamento: "Pix",
    };
    const context = makeContext({ gastos: Array(MAX_CONTEXT_ITEMS + 1).fill(entry) });
    const result = validateAiChatRequest({ question: "oi", context });
    expect(result).toEqual({ ok: false, error: "Contexto financeiro invalido" });
  });

  it("rejects a gasto entry carrying an internal id field", () => {
    const context = makeContext({
      gastos: [
        {
          id: "expense-123",
          descricao: "Mercado",
          categoria: "Casa",
          valor: 100,
          status: "Pago",
          responsavel: "Maria",
          data: "2026-08-01",
          pagamento: "Pix",
        } as never,
      ],
    });
    const result = validateAiChatRequest({ question: "oi", context });
    expect(result).toEqual({ ok: false, error: "Contexto financeiro invalido" });
  });

  it("rejects a non-object body", () => {
    expect(validateAiChatRequest("not an object")).toEqual({
      ok: false,
      error: "Requisicao invalida",
    });
    expect(validateAiChatRequest(null)).toEqual({ ok: false, error: "Requisicao invalida" });
  });

  it("trims the question in the returned value", () => {
    const result = validateAiChatRequest({ question: "  oi  ", context: makeContext() });
    expect(result.ok && result.value.question).toBe("oi");
  });
});
