// @vitest-environment jsdom
// P0-05B round 1: the user must be able to tell a real Gemini answer apart from a
// local fallback, and tell WHY it fell back (rate limit vs consent vs unavailable) —
// without ever seeing a technical/upstream error. These tests render AssistantView
// with FinanceContext and ai.ts mocked, so each path (Gemini success, each fallback
// reason, a deterministic command) can be driven directly and asserted on the
// rendered chat bubble, not just the underlying function call.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FinanceState } from "@/lib/finance/types";

import { AssistantView } from "./AssistantView";

// jsdom doesn't implement scrollIntoView; AssistantView calls it on every message change.
Element.prototype.scrollIntoView = vi.fn();

const MONTH = "2026-08";

function baseState(): FinanceState {
  return {
    people: ["Maria", "Oziel"],
    activePerson: "me",
    activeMonth: MONTH,
    months: {
      [MONTH]: {
        label: "Agosto 2026",
        income: 5000,
        houseContribution: 1000,
        expenses: [],
        priorities: [],
      },
    },
  };
}

const mockFinance = {
  state: baseState(),
  month: baseState().months[MONTH],
  envelopes: [],
  hideValues: false,
  saveMonthSettings: vi.fn(),
  saveExpense: vi.fn(),
  savePriority: vi.fn(),
};

vi.mock("@/lib/finance/FinanceContext", () => ({
  useFinance: () => mockFinance,
  useMoney: () => (value: number) => `R$ ${value.toFixed(2)}`,
}));

vi.mock("@/lib/finance/aiConsent", () => ({ hasAiConsent: () => true }));

vi.mock("@/lib/finance/vigias", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/finance/vigias")>();
  return {
    ...actual,
    listVigias: () => [],
    evaluateVigias: () => [],
    evaluateNewExpense: () => null,
    markFired: () => {},
  };
});

vi.mock("@/lib/finance/learnedCategories", () => ({ lookupLearnedCategory: () => null }));

// Keeps the REAL GeminiRequestError/describeFallback (single source of truth with the
// production code) while mocking only the network-touching/local-answer functions.
// vi.hoisted is required here (not just a top-level const): vi.mock factories run
// during AssistantView.tsx's own import chain, before any later `const` in this file
// would otherwise have initialized — a plain const hits a TDZ ReferenceError.
const { mockAskGemini, mockAnswerLocally } = vi.hoisted(() => ({
  mockAskGemini: vi.fn(),
  mockAnswerLocally: vi.fn(() => "Resumo local: você já gastou R$ 1.200,00 este mês."),
}));
vi.mock("@/lib/finance/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/finance/ai")>();
  return {
    ...actual,
    askGemini: mockAskGemini,
    answerLocally: mockAnswerLocally,
    buildAiContext: () => ({}),
  };
});

const { GeminiRequestError } = await import("@/lib/finance/ai");

const noop = () => {};

async function askAndWait(question: string) {
  render(<AssistantView onAddExpense={noop} onOpenSimulator={noop} onOpenEnvelopes={noop} />);
  const input = screen.getByPlaceholderText("Converse com o Aval");
  fireEvent.change(input, { target: { value: question } });
  fireEvent.click(screen.getByLabelText("Enviar"));
  await waitFor(() => expect(screen.queryByText("Analisando seus dados...")).toBeNull());
}

beforeEach(() => {
  mockAskGemini.mockReset();
  mockAnswerLocally.mockClear();
});

afterEach(() => cleanup());

describe("a real Gemini answer renders as a plain bubble — no fallback marker", () => {
  it("shows the Gemini text with no sender label", async () => {
    mockAskGemini.mockResolvedValue("Seu mês está tranquilo, ainda sobram R$ 800,00.");
    await askAndWait("Como está meu mês?");

    expect(screen.getByText("Seu mês está tranquilo, ainda sobram R$ 800,00.")).toBeTruthy();
    expect(mockAnswerLocally).not.toHaveBeenCalled();
    // none of the fallback labels leaked in
    expect(screen.queryByText(/Resposta local/i)).toBeNull();
  });
});

describe("fallback answers are visibly distinguishable from a Gemini answer", () => {
  it("a rate-limit failure is marked distinctly — never a plain financial answer", async () => {
    mockAskGemini.mockRejectedValue(
      new GeminiRequestError("Muitas perguntas em pouco tempo.", "rate_limit"),
    );
    await askAndWait("Quanto ainda posso gastar?");

    expect(screen.getByText(/Resposta local.*limite de perguntas/i)).toBeTruthy();
    expect(screen.getByText("Resumo local: você já gastou R$ 1.200,00 este mês.")).toBeTruthy();
  });

  it("a timeout/unavailable failure is marked as local, never presented as if Gemini had answered", async () => {
    mockAskGemini.mockRejectedValue(
      new GeminiRequestError("Tempo de resposta excedido. Tente novamente.", "unavailable"),
    );
    await askAndWait("O que está pesando mais?");

    expect(screen.getByText(/Resposta local.*indisponível/i)).toBeTruthy();
    // the technical reason string itself must never reach the rendered bubble
    expect(screen.queryByText(/Tempo de resposta excedido/i)).toBeNull();
  });

  it("consent missing/revoked on the server is not silently masked as a generic answer", async () => {
    mockAskGemini.mockRejectedValue(
      new GeminiRequestError("Consentimento de IA necessario ou desatualizado", "consent"),
    );
    await askAndWait("Como estão minhas metas?");

    expect(screen.getByText(/Resposta local.*consentimento/i)).toBeTruthy();
  });

  it("an unrecognized error still falls back to a labeled, non-empty answer — never a blank bubble", async () => {
    mockAskGemini.mockRejectedValue(new Error("something unexpected"));
    await askAndWait("Como está meu mês?");

    expect(screen.getByText(/Resposta local/i)).toBeTruthy();
    expect(screen.getByText("Resumo local: você já gastou R$ 1.200,00 este mês.")).toBeTruthy();
  });

  it("rate limit and unavailable get different labels from each other", async () => {
    mockAskGemini.mockRejectedValue(
      new GeminiRequestError("Muitas perguntas em pouco tempo.", "rate_limit"),
    );
    await askAndWait("Quanto ainda posso gastar?");
    const rateLimitLabel = screen.getByText(/Resposta local/i).textContent;

    cleanup();
    mockAskGemini.mockRejectedValue(new GeminiRequestError("indisponivel", "unavailable"));
    await askAndWait("Quanto ainda posso gastar?");
    const unavailableLabel = screen.getByText(/Resposta local/i).textContent;

    expect(rateLimitLabel).not.toBe(unavailableLabel);
  });
});

// P0-FRONTEND-1B.6 — quick prompts and the composer's own frame are chrome
// (glass); the textarea the user types into, the send button, and every
// chat bubble show/carry real content and stay solid. No Gemini call is
// exercised in this block — these are pure rendering/structural checks.
describe("AssistantView — Aval Glass (P0-FRONTEND-1B.6)", () => {
  it("quick prompts carry glass-surface and still trigger a question", () => {
    render(<AssistantView onAddExpense={noop} onOpenSimulator={noop} onOpenEnvelopes={noop} />);
    const prompt = screen.getByText("Falta pagar").closest("button");
    expect(prompt?.className).toContain("glass-surface");
  });

  it("the composer frame carries glass-surface", () => {
    render(<AssistantView onAddExpense={noop} onOpenSimulator={noop} onOpenEnvelopes={noop} />);
    const textarea = screen.getByPlaceholderText("Converse com o Aval");
    const form = textarea.closest("form");
    expect(form?.className).toContain("glass-surface");
  });

  it("the textarea itself stays solid — never transparent over the glass frame", () => {
    render(<AssistantView onAddExpense={noop} onOpenSimulator={noop} onOpenEnvelopes={noop} />);
    const textarea = screen.getByPlaceholderText("Converse com o Aval");
    expect(textarea.className).toContain("!bg-card");
    expect(textarea.className).not.toMatch(/glass-/);
  });

  it("the send button stays solid", () => {
    render(<AssistantView onAddExpense={noop} onOpenSimulator={noop} onOpenEnvelopes={noop} />);
    const sendButton = screen.getByLabelText("Enviar");
    expect(sendButton.className).toContain("bg-primary");
    expect(sendButton.className).not.toMatch(/glass-/);
  });

  it("a Gemini answer bubble never carries a glass- utility", async () => {
    mockAskGemini.mockResolvedValue("Seu mês está tranquilo, ainda sobram R$ 800,00.");
    await askAndWait("Como está meu mês?");
    const bubble = screen.getByText("Seu mês está tranquilo, ainda sobram R$ 800,00.");
    expect(bubble.className).not.toMatch(/glass-/);
  });
});
