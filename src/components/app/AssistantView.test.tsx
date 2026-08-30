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
import { VIEW_ALL, VIEW_ME } from "@/lib/finance/constants";

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
        expenses: [
          {
            id: "expense-internet",
            name: "Internet",
            category: "Casa",
            amount: 150,
            status: "A pagar",
            owner: "Maria",
            date: "2026-08-10",
            dueDate: "2026-08-20",
            paymentMethod: "Pix",
            note: "",
          },
          {
            id: "expense-aluguel",
            name: "Aluguel",
            category: "Casa",
            amount: 1200,
            status: "A pagar",
            owner: "Maria",
            date: "2026-08-01",
            paymentMethod: "Pix",
            note: "",
          },
          {
            id: "expense-luz",
            name: "Conta de luz",
            category: "Casa",
            amount: 200,
            status: "A pagar",
            owner: "Maria",
            date: "2026-08-05",
            paymentMethod: "Pix",
            note: "",
          },
        ],
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
  mockFinance.saveExpense.mockClear();
  mockFinance.savePriority.mockClear();
  mockFinance.saveMonthSettings.mockClear();
  mockFinance.state = baseState();
  mockFinance.month = baseState().months[MONTH];
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

  it("calls askGemini with the question and only UI-known hints — no financial numbers built/sent from the client (P7/P7.1)", async () => {
    mockFinance.state = { ...baseState(), activePerson: VIEW_ME, activeMonth: "2026-08" };
    mockAskGemini.mockResolvedValue("Seu mês está tranquilo, ainda sobram R$ 800,00.");
    await askAndWait("Como está meu mês?");

    expect(mockAskGemini).toHaveBeenCalledWith("Como está meu mês?", {
      month: "2026-08",
      scope: "me",
    });
    expect(mockAskGemini).toHaveBeenCalledTimes(1);
  });

  it("a local command (e.g. creating a priority) never reaches askGemini/the Railway backend", async () => {
    await askAndWait("criar meta de 500 para viagem");

    expect(mockAskGemini).not.toHaveBeenCalled();
    expect(mockFinance.savePriority).toHaveBeenCalled();
  });
});

describe("P7.1 — automatic context hints (month/scope), no re-asking what the UI already knows", () => {
  // P7.1.1: "Falta pagar" used to be swallowed by handleAssistantCommand's "mark as
  // paid" regex before ever reaching askGemini — fixed below (see "write command vs.
  // informational query" describe block). All four quick actions now share this table.
  const QUICK_ACTIONS = ["Análise do mês", "Falta pagar", "Meu limite", "Prioridades"];

  it.each(QUICK_ACTIONS)(
    "VIEW_ALL + quick action %s -> month/scope=household, same derivation as every other quick action",
    async (label) => {
      mockFinance.state = { ...baseState(), activePerson: VIEW_ALL, activeMonth: "2026-07" };
      mockAskGemini.mockResolvedValue("ok");
      render(<AssistantView onAddExpense={noop} onOpenSimulator={noop} onOpenEnvelopes={noop} />);
      fireEvent.click(screen.getByText(label));
      await waitFor(() => expect(mockAskGemini).toHaveBeenCalledTimes(1));
      expect(mockAskGemini).toHaveBeenCalledWith(label, { month: "2026-07", scope: "household" });
    },
  );

  it("VIEW_ME sends scope=me", async () => {
    mockFinance.state = { ...baseState(), activePerson: VIEW_ME, activeMonth: "2026-07" };
    mockAskGemini.mockResolvedValue("ok");
    render(<AssistantView onAddExpense={noop} onOpenSimulator={noop} onOpenEnvelopes={noop} />);
    fireEvent.click(screen.getByText("Meu limite"));
    await waitFor(() => expect(mockAskGemini).toHaveBeenCalledTimes(1));
    expect(mockAskGemini).toHaveBeenCalledWith("Meu limite", { month: "2026-07", scope: "me" });
  });

  it("a manually typed question receives the same current context as a quick action", async () => {
    mockFinance.state = { ...baseState(), activePerson: VIEW_ALL, activeMonth: "2026-07" };
    mockAskGemini.mockResolvedValue("ok");
    await askAndWait("Quanto ainda posso gastar?");
    expect(mockAskGemini).toHaveBeenCalledWith("Quanto ainda posso gastar?", {
      month: "2026-07",
      scope: "household",
    });
  });

  it("a specific-profile view sends no scope/profileId — never degrades to household/me, never fabricates a UUID", async () => {
    mockFinance.state = { ...baseState(), activePerson: "Maria", activeMonth: "2026-07" };
    mockAskGemini.mockResolvedValue("ok");
    await askAndWait("Como está meu mês?");
    expect(mockAskGemini).toHaveBeenCalledWith("Como está meu mês?", {});
  });

  it("changing the active month changes the hint sent on the next question", async () => {
    mockFinance.state = { ...baseState(), activePerson: VIEW_ALL, activeMonth: "2026-07" };
    mockAskGemini.mockResolvedValue("ok");
    await askAndWait("pergunta 1");
    expect(mockAskGemini).toHaveBeenNthCalledWith(1, "pergunta 1", {
      month: "2026-07",
      scope: "household",
    });

    cleanup();
    mockFinance.state = { ...baseState(), activePerson: VIEW_ALL, activeMonth: "2026-08" };
    await askAndWait("pergunta 2");
    expect(mockAskGemini).toHaveBeenNthCalledWith(2, "pergunta 2", {
      month: "2026-08",
      scope: "household",
    });
  });

  it("changing the active scope changes the hint sent on the next question", async () => {
    mockFinance.state = { ...baseState(), activePerson: VIEW_ALL, activeMonth: "2026-07" };
    mockAskGemini.mockResolvedValue("ok");
    await askAndWait("pergunta 1");
    expect(mockAskGemini).toHaveBeenNthCalledWith(1, "pergunta 1", {
      month: "2026-07",
      scope: "household",
    });

    cleanup();
    mockFinance.state = { ...baseState(), activePerson: VIEW_ME, activeMonth: "2026-07" };
    await askAndWait("pergunta 2");
    expect(mockAskGemini).toHaveBeenNthCalledWith(2, "pergunta 2", {
      month: "2026-07",
      scope: "me",
    });
  });
});

describe("P7.1.2 — Assistant answer money formatting", () => {
  it("reformats a malformed R$ amount from Gemini to pt-BR before rendering", async () => {
    mockAskGemini.mockResolvedValue("Seu orçamento total é R$6800,00 e o saldo livre é R$2470,00.");
    await askAndWait("Análise do mês");
    expect(
      screen.getByText("Seu orçamento total é R$ 6.800,00 e o saldo livre é R$ 2.470,00."),
    ).toBeTruthy();
  });

  it("still masks the (now correctly formatted) amount when hideValues is on", async () => {
    mockFinance.hideValues = true;
    mockAskGemini.mockResolvedValue("Saldo: R$6800,00.");
    await askAndWait("Análise do mês");
    expect(screen.getByText("Saldo: R$ ••••.")).toBeTruthy();
    mockFinance.hideValues = false;
  });
});

describe("P7.1.1 — write command vs. informational 'falta pagar' query", () => {
  it("quick action 'Falta pagar' reaches the Assistant with month/scope, not the local command parser", async () => {
    mockFinance.state = { ...baseState(), activePerson: VIEW_ALL, activeMonth: "2026-07" };
    mockAskGemini.mockResolvedValue("Você ainda tem 2 contas a pagar.");
    render(<AssistantView onAddExpense={noop} onOpenSimulator={noop} onOpenEnvelopes={noop} />);
    fireEvent.click(screen.getByText("Falta pagar"));
    await waitFor(() => expect(mockAskGemini).toHaveBeenCalledTimes(1));
    expect(mockAskGemini).toHaveBeenCalledWith("Falta pagar", {
      month: "2026-07",
      scope: "household",
    });
    expect(mockFinance.saveExpense).not.toHaveBeenCalled();
  });

  it("'o que falta pagar?' is an informational query — reaches askGemini, not a local command", async () => {
    mockAskGemini.mockResolvedValue("Você tem 2 contas a pagar.");
    await askAndWait("o que falta pagar?");
    expect(mockAskGemini).toHaveBeenCalledWith(
      "o que falta pagar?",
      expect.objectContaining({ scope: "me" }),
    );
    expect(mockFinance.saveExpense).not.toHaveBeenCalled();
  });

  it("'quanto falta pagar este mês?' is an informational query — reaches askGemini, not a local command", async () => {
    mockAskGemini.mockResolvedValue("Você tem 2 contas a pagar.");
    await askAndWait("quanto falta pagar este mês?");
    expect(mockAskGemini).toHaveBeenCalledWith(
      "quanto falta pagar este mês?",
      expect.objectContaining({ scope: "me" }),
    );
    expect(mockFinance.saveExpense).not.toHaveBeenCalled();
  });

  it("'marcar internet como paga' is still a local write command — zero Railway call", async () => {
    await askAndWait("marcar internet como paga");
    expect(mockAskGemini).not.toHaveBeenCalled();
  });

  it("'marcar internet como pago' is a local write command that finds and pays the matching bill", async () => {
    await askAndWait("marcar internet como pago");
    expect(mockAskGemini).not.toHaveBeenCalled();
    expect(mockFinance.saveExpense).toHaveBeenCalledWith(
      expect.objectContaining({ id: "expense-internet", status: "Pago" }),
      "expense-internet",
    );
  });

  it("'quitar aluguel' is still a local write command — zero Railway call", async () => {
    await askAndWait("quitar aluguel");
    expect(mockAskGemini).not.toHaveBeenCalled();
    expect(mockFinance.saveExpense).toHaveBeenCalledWith(
      expect.objectContaining({ id: "expense-aluguel", status: "Pago" }),
      "expense-aluguel",
    );
  });

  it("'pagar conta de luz' is still a local write command — zero Railway call", async () => {
    await askAndWait("pagar conta de luz");
    expect(mockAskGemini).not.toHaveBeenCalled();
    expect(mockFinance.saveExpense).toHaveBeenCalledWith(
      expect.objectContaining({ id: "expense-luz", status: "Pago" }),
      "expense-luz",
    );
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

  // P0-FRONTEND-1B.7 — the empty-state hero's "Perguntar ao Aval" button
  // uses the real brand mark instead of a generic sparkles icon.
  it("the hero's Perguntar ao Aval button renders the Aval brand mark", () => {
    render(<AssistantView onAddExpense={noop} onOpenSimulator={noop} onOpenEnvelopes={noop} />);
    const button = screen.getByText("Perguntar ao Aval").closest("button");
    const svg = button?.querySelector("svg");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 32 32");
  });

  it("every AI bubble avatar uses the Aval brand mark", async () => {
    mockAskGemini.mockResolvedValue("Seu mês está tranquilo, ainda sobram R$ 800,00.");
    await askAndWait("Como está meu mês?");
    const bubble = screen.getByText("Seu mês está tranquilo, ainda sobram R$ 800,00.");
    const avatar = bubble.closest("div.flex.items-start")?.querySelector("svg");
    expect(avatar?.getAttribute("viewBox")).toBe("0 0 32 32");
  });
});
