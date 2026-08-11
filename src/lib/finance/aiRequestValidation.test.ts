import { describe, expect, it } from "vitest";

import {
  MAX_AI_CATEGORY_ITEMS,
  MAX_CONTEXT_ITEMS,
  MAX_QUESTION_LENGTH,
  validateAiChatRequest,
  type AiBalanceContext,
  type AiBillEntry,
  type AiChatContext,
  type AiGoalEntry,
} from "./aiRequestValidation";

function balanceContext(overrides: Partial<AiBalanceContext> = {}): AiBalanceContext {
  return {
    tipo: "BALANCE",
    mes: "Agosto de 2026",
    planejamento: false,
    visao: "Tudo",
    orcamento: 5000,
    totalGasto: 1200,
    pendente: 300,
    pago: 900,
    saldoRestante: 3800,
    ...overrides,
  };
}

function goalEntry(overrides: Partial<AiGoalEntry> = {}): AiGoalEntry {
  return {
    descricao: "Trocar geladeira",
    valorAlvo: 1500,
    prioridade: 1,
    status: "A pagar",
    responsavel: "Maria",
    ...overrides,
  };
}

function billEntry(overrides: Partial<AiBillEntry> = {}): AiBillEntry {
  return {
    descricao: "Aluguel",
    categoria: "Casa",
    valor: 1200,
    responsavel: "Maria",
    data: "2026-08-01",
    ...overrides,
  };
}

function request(context: AiChatContext, question = "oi") {
  return validateAiChatRequest({ question, context });
}

describe("validateAiChatRequest — request-level checks (shape-agnostic)", () => {
  it("accepts a well-formed request", () => {
    expect(request(balanceContext())).toEqual({
      ok: true,
      value: { question: "oi", context: balanceContext() },
    });
  });

  it("rejects an empty question", () => {
    expect(validateAiChatRequest({ question: "   ", context: balanceContext() })).toEqual({
      ok: false,
      error: "Pergunta vazia",
    });
  });

  it("rejects a question over the max length", () => {
    const result = validateAiChatRequest({
      question: "a".repeat(MAX_QUESTION_LENGTH + 1),
      context: balanceContext(),
    });
    expect(result).toEqual({ ok: false, error: "Pergunta muito longa" });
  });

  it("rejects unknown top-level fields (e.g. a smuggled history array)", () => {
    const result = validateAiChatRequest({
      question: "oi",
      context: balanceContext(),
      history: [{ role: "user", text: "oi" }],
    });
    expect(result).toEqual({ ok: false, error: "Requisicao invalida" });
  });

  it("rejects a non-object body", () => {
    expect(validateAiChatRequest("not an object")).toEqual({
      ok: false,
      error: "Requisicao invalida",
    });
    expect(validateAiChatRequest(null)).toEqual({ ok: false, error: "Requisicao invalida" });
  });

  it("trims the question in the returned value", () => {
    const result = validateAiChatRequest({ question: "  oi  ", context: balanceContext() });
    expect(result.ok && result.value.question).toBe("oi");
  });

  it("rejects an unrecognized tipo", () => {
    const context = { ...balanceContext(), tipo: "SOMETHING_ELSE" } as unknown as AiChatContext;
    expect(request(context)).toEqual({ ok: false, error: "Contexto financeiro invalido" });
  });

  it("rejects a context missing tipo entirely (the old single-shape contract)", () => {
    const { tipo: _tipo, ...withoutTipo } = balanceContext();
    expect(request(withoutTipo as unknown as AiChatContext)).toEqual({
      ok: false,
      error: "Contexto financeiro invalido",
    });
  });
});

describe("BALANCE — no gastos/prioridades allowed", () => {
  it("accepts the minimal aggregate shape", () => {
    expect(request(balanceContext()).ok).toBe(true);
  });

  it("rejects a BALANCE context carrying prioridades/metas (belongs to GOALS)", () => {
    const context = { ...balanceContext(), metas: [] } as unknown as AiChatContext;
    expect(request(context)).toEqual({ ok: false, error: "Contexto financeiro invalido" });
  });

  it("rejects a BALANCE context carrying gastos (belongs to no current variant)", () => {
    const context = { ...balanceContext(), gastos: [] } as unknown as AiChatContext;
    expect(request(context)).toEqual({ ok: false, error: "Contexto financeiro invalido" });
  });

  it("rejects an unknown field (e.g. a smuggled userEmail)", () => {
    const context = { ...balanceContext(), userEmail: "a@b.com" } as unknown as AiChatContext;
    expect(request(context)).toEqual({ ok: false, error: "Contexto financeiro invalido" });
  });
});

describe("MONTH_OVERVIEW — aggregates + maiorCategoria only", () => {
  function context(overrides: Record<string, unknown> = {}) {
    return {
      ...balanceContext(),
      tipo: "MONTH_OVERVIEW",
      maiorCategoria: { category: "Casa", total: 600 },
      ...overrides,
    } as unknown as AiChatContext;
  }

  it("accepts a null maiorCategoria", () => {
    expect(request(context({ maiorCategoria: null })).ok).toBe(true);
  });

  it("accepts a populated maiorCategoria", () => {
    expect(request(context()).ok).toBe(true);
  });

  it("rejects a maiorCategoria carrying an extra field", () => {
    expect(request(context({ maiorCategoria: { category: "Casa", total: 600, id: "x" } }))).toEqual(
      { ok: false, error: "Contexto financeiro invalido" },
    );
  });

  it("rejects a MONTH_OVERVIEW context also carrying gastos", () => {
    expect(request(context({ gastos: [] }))).toEqual({
      ok: false,
      error: "Contexto financeiro invalido",
    });
  });
});

describe("EXPENSE_ANALYSIS — category breakdown, dedicated cap", () => {
  function context(categorias: unknown) {
    return {
      ...balanceContext(),
      tipo: "EXPENSE_ANALYSIS",
      categorias,
    } as unknown as AiChatContext;
  }

  it("accepts an empty breakdown", () => {
    expect(request(context([])).ok).toBe(true);
  });

  it(`accepts exactly ${MAX_AI_CATEGORY_ITEMS} categories`, () => {
    const categorias = Array.from({ length: MAX_AI_CATEGORY_ITEMS }, (_, i) => ({
      category: `Categoria ${i}`,
      total: 10,
    }));
    expect(request(context(categorias)).ok).toBe(true);
  });

  it(`rejects ${MAX_AI_CATEGORY_ITEMS + 1} categories — beyond the dedicated cap`, () => {
    const categorias = Array.from({ length: MAX_AI_CATEGORY_ITEMS + 1 }, (_, i) => ({
      category: `Categoria ${i}`,
      total: 10,
    }));
    expect(request(context(categorias))).toEqual({
      ok: false,
      error: "Contexto financeiro invalido",
    });
  });

  it("does not reuse MAX_CONTEXT_ITEMS as the category cap", () => {
    expect(MAX_AI_CATEGORY_ITEMS).not.toBe(MAX_CONTEXT_ITEMS);
    expect(MAX_AI_CATEGORY_ITEMS).toBeGreaterThan(MAX_CONTEXT_ITEMS);
  });

  it("rejects a category entry carrying a description/responsavel field (individual-expense shape)", () => {
    expect(request(context([{ category: "Casa", total: 600, descricao: "Aluguel" }]))).toEqual({
      ok: false,
      error: "Contexto financeiro invalido",
    });
  });
});

describe("GOALS — metas only, saved-derived fields optional", () => {
  function context(metas: unknown) {
    return {
      tipo: "GOALS",
      mes: "Agosto de 2026",
      planejamento: false,
      visao: "Tudo",
      saldoRestante: 3800,
      metas,
    } as unknown as AiChatContext;
  }

  it("accepts a meta without saved-derived fields (saved was never tracked)", () => {
    expect(request(context([goalEntry()])).ok).toBe(true);
  });

  it("accepts a meta with valorGuardado/faltante/progresso when saved is tracked", () => {
    const entry = goalEntry({ valorGuardado: 300, faltante: 1200, progresso: 0.2 });
    expect(request(context([entry])).ok).toBe(true);
  });

  it("rejects a GOALS context carrying gastos", () => {
    expect(request({ ...context([]), gastos: [] } as unknown as AiChatContext)).toEqual({
      ok: false,
      error: "Contexto financeiro invalido",
    });
  });

  it("rejects metas beyond the item cap", () => {
    const metas = Array(MAX_CONTEXT_ITEMS + 1).fill(goalEntry());
    expect(request(context(metas))).toEqual({ ok: false, error: "Contexto financeiro invalido" });
  });

  it("rejects a meta entry carrying an internal id field", () => {
    expect(request(context([{ ...goalEntry(), id: "priority-1" }]))).toEqual({
      ok: false,
      error: "Contexto financeiro invalido",
    });
  });
});

describe("BILLS — pending expenses only, dueDate optional", () => {
  function context(contas: unknown) {
    return {
      tipo: "BILLS",
      mes: "Agosto de 2026",
      planejamento: false,
      visao: "Tudo",
      contas,
    } as unknown as AiChatContext;
  }

  it("accepts a bill without dueDate", () => {
    expect(request(context([billEntry()])).ok).toBe(true);
  });

  it("accepts a bill with dueDate", () => {
    expect(request(context([billEntry({ dueDate: "2026-08-15" })])).ok).toBe(true);
  });

  it("rejects a bill entry carrying a status field (implied by BILLS, not sent)", () => {
    expect(request(context([{ ...billEntry(), status: "A pagar" }]))).toEqual({
      ok: false,
      error: "Contexto financeiro invalido",
    });
  });

  it("rejects contas beyond the item cap", () => {
    const contas = Array(MAX_CONTEXT_ITEMS + 1).fill(billEntry());
    expect(request(context(contas))).toEqual({ ok: false, error: "Contexto financeiro invalido" });
  });

  it("rejects a BILLS context also carrying prioridades/metas", () => {
    expect(request({ ...context([]), metas: [] } as unknown as AiChatContext)).toEqual({
      ok: false,
      error: "Contexto financeiro invalido",
    });
  });
});

describe("COMPARISON — current-month aggregates only, no historical field accepted", () => {
  function context(overrides: Record<string, unknown> = {}) {
    return { ...balanceContext(), tipo: "COMPARISON", ...overrides } as unknown as AiChatContext;
  }

  it("accepts the minimal current-month shape", () => {
    expect(request(context()).ok).toBe(true);
  });

  it("rejects a COMPARISON context carrying a previous-month field", () => {
    expect(request(context({ mesAnterior: { totalGasto: 900 } }))).toEqual({
      ok: false,
      error: "Contexto financeiro invalido",
    });
  });

  it("rejects a COMPARISON context carrying gastos", () => {
    expect(request(context({ gastos: [] }))).toEqual({
      ok: false,
      error: "Contexto financeiro invalido",
    });
  });
});

describe("GENERAL — safe minimal fallback, never the full old shape", () => {
  function context(overrides: Record<string, unknown> = {}) {
    return { ...balanceContext(), tipo: "GENERAL", ...overrides } as unknown as AiChatContext;
  }

  it("accepts the minimal aggregate shape", () => {
    expect(request(context()).ok).toBe(true);
  });

  it("rejects a GENERAL context carrying gastos or prioridades", () => {
    expect(request(context({ gastos: [] }))).toEqual({
      ok: false,
      error: "Contexto financeiro invalido",
    });
    expect(request(context({ prioridades: [] }))).toEqual({
      ok: false,
      error: "Contexto financeiro invalido",
    });
  });
});
