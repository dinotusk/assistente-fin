// @vitest-environment jsdom
// P8 — PurchaseSimulatorDialog routed through the Railway backend
// (simulatePurchase), explicit-action-only, local calculator as the network
// fallback. Mirrors the mocking conventions of dialogs.SaveFlows.test.tsx.
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FinanceState } from "@/lib/finance/types";
import { VIEW_ALL, VIEW_ME } from "@/lib/finance/constants";
import type { MoneyValue, SimulatePurchaseResponse } from "@/lib/api/backendClient";

vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DrawerContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
}));

const MONTH = "2026-09"; // future relative to "today" -> deterministic full daysLeft, no Date mocking needed

function baseMonth() {
  return {
    label: "Setembro 2026",
    income: 3000,
    houseContribution: 0,
    expenses: [],
    priorities: [],
  };
}

function baseState(activePerson: string): FinanceState {
  return {
    people: ["Maria", "Oziel"],
    activePerson,
    activeMonth: MONTH,
    months: { [MONTH]: baseMonth() },
  };
}

const mockFinance = {
  month: baseMonth(),
  state: baseState(VIEW_ALL),
  hideValues: false,
  savePriority: vi.fn(),
};

vi.mock("@/lib/finance/FinanceContext", () => ({
  useFinance: () => mockFinance,
  useMoney: () => (value: number) => `R$ ${value.toFixed(2)}`,
}));

const mockSimulatePurchase = vi.fn();
vi.mock("@/lib/api/backendClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/backendClient")>();
  return { ...actual, simulatePurchase: mockSimulatePurchase };
});

const { PurchaseSimulatorDialog } = await import("./dialogs");
const { BackendApiError } = await import("@/lib/api/backendClient");

// P8.1 — the real backend wire shape (confirmed via a live DevTools capture, see the P8.1
// diagnosis): every money field is a {value, provenance} object, never a bare string; an
// earlier version of this fixture (and of backendClient.ts's own type) assumed bare strings,
// which the real backend never sent, and it went undetected because nothing here ever
// exercised the real shape.
function moneyValue(
  value: string,
  provenance: MoneyValue["provenance"] = "CALCULATED",
): MoneyValue {
  return { value, provenance };
}

function remoteResponse(
  overrides: Partial<SimulatePurchaseResponse> = {},
): SimulatePurchaseResponse {
  return {
    isHypothetical: true,
    purchaseAmount: moneyValue("100.00", "INPUT"),
    installments: 1,
    installmentSchedule: [moneyValue("100.00")],
    currentBudget: moneyValue("3000.00"),
    currentTotal: moneyValue("0.00"),
    currentFree: moneyValue("3000.00"),
    projectedTotal: moneyValue("100.00"),
    projectedFree: moneyValue("2900.00"),
    status: "FEASIBLE",
    assumptions: [],
    warnings: [],
    ...overrides,
  };
}

// The exact payload captured from a real DevTools session against the Railway backend (P8.1
// diagnosis) — used as the primary "is this realistic" fixture, not a hand-simplified one.
const REALISTIC_BACKEND_RESPONSE: SimulatePurchaseResponse = {
  isHypothetical: true,
  purchaseAmount: { value: "10.00", provenance: "INPUT" },
  installments: 1,
  installmentSchedule: [{ value: "10.00", provenance: "CALCULATED" }],
  currentBudget: { value: "5000.00", provenance: "CALCULATED" },
  currentTotal: { value: "2570.00", provenance: "CALCULATED" },
  currentFree: { value: "2430.00", provenance: "CALCULATED" },
  projectedTotal: { value: "2580.00", provenance: "CALCULATED" },
  projectedFree: { value: "2420.00", provenance: "CALCULATED" },
  status: "FEASIBLE",
  assumptions: [
    {
      code: "HYPOTHETICAL_SCENARIO",
      description:
        "Este e um cenario hipotetico de simulacao; nenhum dado financeiro real foi alterado.",
    },
    {
      code: "NO_INTEREST_INSTALLMENTS",
      description:
        "Parcelamento sem juros — nenhuma taxa foi aplicada, pois nenhuma foi informada.",
    },
  ],
  warnings: [],
};

async function fillAndSimulate(name: string, value: string) {
  render(<PurchaseSimulatorDialog open onOpenChange={() => {}} />);
  fireEvent.change(screen.getByLabelText("O que quer comprar?"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Valor"), { target: { value } });
  fireEvent.click(screen.getByText("Simular"));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFinance.month = baseMonth();
  mockFinance.state = baseState(VIEW_ALL);
});

afterEach(() => cleanup());

describe("scope mapping", () => {
  it("VIEW_ALL calls Railway with scope=household", async () => {
    mockFinance.state = baseState(VIEW_ALL);
    mockSimulatePurchase.mockResolvedValue(remoteResponse());
    await fillAndSimulate("Mesa", "100");
    await waitFor(() => expect(mockSimulatePurchase).toHaveBeenCalledTimes(1));
    expect(mockSimulatePurchase).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "household", month: MONTH, purchaseAmount: "100.00" }),
    );
  });

  it("VIEW_ME calls Railway with scope=me", async () => {
    mockFinance.state = baseState(VIEW_ME);
    mockSimulatePurchase.mockResolvedValue(remoteResponse());
    await fillAndSimulate("Mesa", "100");
    await waitFor(() => expect(mockSimulatePurchase).toHaveBeenCalledTimes(1));
    expect(mockSimulatePurchase).toHaveBeenCalledWith(expect.objectContaining({ scope: "me" }));
  });

  it("a specific-profile view never calls Railway — local calculation only", async () => {
    mockFinance.state = baseState("Maria");
    await fillAndSimulate("Mesa", "100");
    await waitFor(() =>
      expect(screen.getByText(/Compra segura|Melhor não comprar|pesada/)).toBeTruthy(),
    );
    expect(mockSimulatePurchase).not.toHaveBeenCalled();
    expect(screen.getByText(/Cálculo local/)).toBeTruthy();
  });
});

describe("remote results", () => {
  it("renders a FEASIBLE result using the backend's projectedFree.value — no 'Cálculo local' marker on a 200", async () => {
    mockSimulatePurchase.mockResolvedValue(
      remoteResponse({ status: "FEASIBLE", projectedFree: moneyValue("2900.00") }),
    );
    await fillAndSimulate("Mesa", "100");
    await waitFor(() => expect(screen.getByText("Compra segura para este mês")).toBeTruthy());
    expect(screen.getByText(/R\$ 2900\.00/)).toBeTruthy();
    expect(screen.queryByText(/Cálculo local/)).toBeNull();
  });

  it("renders a NOT_FEASIBLE result as 'Melhor não comprar agora'", async () => {
    mockSimulatePurchase.mockResolvedValue(
      remoteResponse({ status: "NOT_FEASIBLE", projectedFree: moneyValue("-500.00") }),
    );
    await fillAndSimulate("Mesa", "3500");
    await waitFor(() => expect(screen.getByText("Melhor não comprar agora")).toBeTruthy());
  });

  it("still classifies as 'pesada' when the amount exceeds weeklyAllowance despite FEASIBLE", async () => {
    // free=3000, daysLeft=30 (Sept, future month) -> weeklyAllowance = 700
    mockSimulatePurchase.mockResolvedValue(
      remoteResponse({ status: "FEASIBLE", projectedFree: moneyValue("2200.00") }),
    );
    await fillAndSimulate("Mesa", "800"); // 800 > 700
    await waitFor(() => expect(screen.getByText("Compra possível, mas pesada")).toBeTruthy());
  });

  it("renders the exact realistic backend payload (captured from a live DevTools session) without NaN or a fallback marker", async () => {
    mockSimulatePurchase.mockResolvedValue(REALISTIC_BACKEND_RESPONSE);
    await fillAndSimulate("mesa", "10");
    await waitFor(() => expect(screen.getByText("Compra segura para este mês")).toBeTruthy());
    expect(screen.getByText(/R\$ 2420\.00/)).toBeTruthy();
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.queryByText(/R\$ 0\.00/)).toBeNull();
    expect(screen.queryByText(/Cálculo local/)).toBeNull();
  });
});

describe("failure handling", () => {
  it("network failure falls back to the local calculator, with a discreet local-calc marker", async () => {
    mockSimulatePurchase.mockRejectedValue(new TypeError("Failed to fetch"));
    await fillAndSimulate("Mesa", "100");
    await waitFor(() => expect(screen.getByText("Compra segura para este mês")).toBeTruthy());
    expect(screen.getByText(/Cálculo local/)).toBeTruthy();
  });

  it("a 5xx falls back to the local calculator", async () => {
    mockSimulatePurchase.mockRejectedValue(new BackendApiError("Erro interno", 500));
    await fillAndSimulate("Mesa", "100");
    await waitFor(() => expect(screen.getByText("Compra segura para este mês")).toBeTruthy());
    expect(screen.getByText(/Cálculo local/)).toBeTruthy();
  });

  it("a 400 shows an explicit error, never a computed local result", async () => {
    mockSimulatePurchase.mockRejectedValue(
      new BackendApiError("Valor invalido", 400, "VALIDATION_ERROR"),
    );
    await fillAndSimulate("Mesa", "100");
    await waitFor(() => expect(screen.getByText("Não foi possível simular")).toBeTruthy());
    expect(screen.queryByText("Compra segura para este mês")).toBeNull();
    expect(screen.queryByText(/Cálculo local/)).toBeNull();
  });

  it("a 401 shows an explicit session error, never a fallback", async () => {
    mockSimulatePurchase.mockRejectedValue(new BackendApiError("Sessao nao encontrada", 401));
    await fillAndSimulate("Mesa", "100");
    await waitFor(() => expect(screen.getByText("Não foi possível simular")).toBeTruthy());
    expect(screen.queryByText(/Cálculo local/)).toBeNull();
  });

  it("a 403 shows an explicit error, never a fallback", async () => {
    mockSimulatePurchase.mockRejectedValue(
      new BackendApiError("Acesso negado", 403, "ACCESS_DENIED"),
    );
    await fillAndSimulate("Mesa", "100");
    await waitFor(() => expect(screen.getByText("Não foi possível simular")).toBeTruthy());
    expect(screen.queryByText(/Cálculo local/)).toBeNull();
  });

  it("a 429 shows an explicit rate-limit error, never a fallback", async () => {
    mockSimulatePurchase.mockRejectedValue(
      new BackendApiError("Muitas tentativas", 429, "RATE_LIMITED"),
    );
    await fillAndSimulate("Mesa", "100");
    await waitFor(() => expect(screen.getByText("Não foi possível simular")).toBeTruthy());
    expect(screen.queryByText(/Cálculo local/)).toBeNull();
  });
});

describe("request/staleness guards", () => {
  it("clicking Simular while a request is in flight does not fire a second request", async () => {
    let resolveCall: (value: unknown) => void = () => {};
    mockSimulatePurchase.mockReturnValue(new Promise((resolve) => (resolveCall = resolve)));
    render(<PurchaseSimulatorDialog open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText("O que quer comprar?"), { target: { value: "Mesa" } });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "100" } });
    fireEvent.click(screen.getByText("Simular"));
    await waitFor(() => expect(screen.getByText("Simulando…")).toBeTruthy());
    // The button is disabled while loading — a real browser never delivers these
    // clicks to the handler at all, so this proves the disabled state is wired.
    fireEvent.click(screen.getByText("Simulando…"));
    fireEvent.click(screen.getByText("Simulando…"));
    resolveCall(remoteResponse());
    await waitFor(() => expect(mockSimulatePurchase).toHaveBeenCalledTimes(1));
  });

  it("changing the amount after a result invalidates it — the stale result is not shown as current", async () => {
    mockSimulatePurchase.mockResolvedValue(
      remoteResponse({ status: "FEASIBLE", projectedFree: moneyValue("2900.00") }),
    );
    render(<PurchaseSimulatorDialog open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText("O que quer comprar?"), { target: { value: "Mesa" } });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "100" } });
    fireEvent.click(screen.getByText("Simular"));
    await waitFor(() => expect(screen.getByText(/R\$ 2900\.00/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "200" } });
    // The remote-sourced "2900.00" figure must not linger once the input no longer matches it.
    expect(screen.queryByText(/R\$ 2900\.00/)).toBeNull();
  });
});

describe("save-to-goals is unaffected", () => {
  it("does not call savePriority automatically after simulating", async () => {
    mockSimulatePurchase.mockResolvedValue(remoteResponse());
    await fillAndSimulate("Mesa", "100");
    await waitFor(() => expect(mockSimulatePurchase).toHaveBeenCalledTimes(1));
    expect(mockFinance.savePriority).not.toHaveBeenCalled();
  });

  it("still saves via the existing savePriority flow when the Salvar button is clicked", async () => {
    mockSimulatePurchase.mockResolvedValue(remoteResponse());
    await fillAndSimulate("Mesa", "100");
    await waitFor(() => expect(mockSimulatePurchase).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("Salvar simulação em Metas"));
    expect(mockFinance.savePriority).toHaveBeenCalledTimes(1);
    expect(mockFinance.savePriority).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Mesa", amount: 100 }),
    );
  });
});
