import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Calculator,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Wallet,
  X,
} from "lucide-react";

import {
  calc,
  categoryLabel,
  chartMonthEntries,
  expensesForView,
  budgetForView,
  getLargestCategoryGrowth,
  maskMoneyInText,
  normalizeText,
  ownerLabelForPeople,
  resolveViewOwner,
  sum,
  viewLabelForPeople,
} from "@/lib/finance/calc";
import { answerLocally, askGemini, buildAiContext } from "@/lib/finance/ai";
import { lookupLearnedCategory } from "@/lib/finance/learnedCategories";
import { categories, paymentMethods, VIEW_ALL, VIEW_ME, VIEW_SPOUSE } from "@/lib/finance/constants";
import { useFinance, useMoney } from "@/lib/finance/FinanceContext";
import { uid } from "@/lib/finance/seed";
import type { Expense } from "@/lib/finance/types";
import { evaluateNewExpense, evaluateVigias, listVigias, markFired, type VigiaAlert } from "@/lib/finance/vigias";

import { Field, SelectInput, TextArea, TextInput } from "./forms";
import { AvalMark, BudgetRing, Panel, PanelHead, Sparkline } from "./ui";

interface Message {
  sender?: string;
  role: "user" | "ai";
  text: string;
}

interface AssistantViewProps {
  onAddExpense: () => void;
}

function alertsToMessages(alerts: VigiaAlert[]): Message[] {
  return alerts.map((alert) => ({ role: "ai", sender: alert.vigia.name, text: alert.message }));
}

export function AssistantView({ onAddExpense }: AssistantViewProps) {
  const {
    state,
    month,
    envelopes,
    hideValues,
    saveMonthSettings,
    saveExpense,
    savePriority,
    saveEnvelopes,
  } = useFinance();
  const money = useMoney();
  const view = state.activePerson;
  const numbers = calc(month, view, state.activeMonth);
  const expenses = expensesForView(month, view);
  const growth = getLargestCategoryGrowth(state, view);
  const biggestPending = expenses
    .filter((e) => e.status === "A pagar")
    .sort((a, b) => b.amount - a.amount)[0];

  const budget = budgetForView(month, view);
  const usedPct = budget > 0 ? Math.min(100, (numbers.total / budget) * 100) : 0;
  const overBudget = numbers.free < 0;
  const spendingTrend = chartMonthEntries(state, 6).map(([, data]) => sum(expensesForView(data, view)));
  const today = new Date().toISOString().slice(0, 10);
  const nextDue = expenses
    .filter((item) => item.status === "A pagar")
    .sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date))[0];
  const daysToNextDue = nextDue
    ? Math.max(0, Math.ceil((new Date(nextDue.dueDate || nextDue.date).getTime() - new Date(today).getTime()) / 86400000))
    : null;

  const weeklyAllowance = numbers.daysLeft > 0 ? Math.max(0, (numbers.free / numbers.daysLeft) * 7) : 0;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [purchaseName, setPurchaseName] = useState("");
  const [purchaseValue, setPurchaseValue] = useState("");
  const [editingEnvelopes, setEditingEnvelopes] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const attentionRef = useRef<HTMLDivElement | null>(null);
  const simulatorRef = useRef<HTMLDivElement | null>(null);
  const purchaseNameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => {
    const vigias = listVigias();
    const alerts = evaluateVigias(vigias, state, month, envelopes);
    if (!alerts.length) return;
    setMessages((m) => [...m, ...alertsToMessages(alerts)]);
    markFired(vigias, alerts.map((a) => a.vigia.id));
    // Only on mount ("ao abrir o app") — deliberately not re-running on every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fireNewExpenseVigia(expense: Expense) {
    const alert = evaluateNewExpense(listVigias(), state, expense);
    if (!alert) return;
    setMessages((m) => [...m, ...alertsToMessages([alert])]);
    markFired(listVigias(), [alert.vigia.id]);
  }

  function startNewConversation() {
    setMessages([]);
  }

  function updateEnvelope(id: string, patch: Partial<(typeof envelopes)[number]>) {
    saveEnvelopes(envelopes.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addEnvelope() {
    saveEnvelopes([
      ...envelopes,
      { id: `env-${Date.now()}`, label: "Novo envelope", limit: 0, categories: ["Outros"] },
    ]);
    setEditingEnvelopes(true);
  }

  function deleteEnvelope(id: string) {
    saveEnvelopes(envelopes.filter((item) => item.id !== id));
  }

  const purchaseAmount = parseCurrencyInput(purchaseValue);
  const purchaseResult = getPurchaseResult(purchaseName, purchaseAmount, numbers.free, weeklyAllowance, money);

  function updatePurchaseValue(value: string) {
    setPurchaseValue(value.replace(/[^\d,.]/g, ""));
  }

  function savePurchaseSimulation() {
    const name = purchaseName.trim();
    if (!name || purchaseAmount <= 0) return;
    savePriority({
      id: uid(),
      name,
      amount: purchaseAmount,
      rank: purchaseResult.ok ? 2 : 3,
      status: purchaseResult.ok ? "A pagar" : "Adiar",
      responsavel: resolveViewOwner(view) || "Minha casa",
      createdAt: new Date().toISOString(),
    });
    setMessages((m) => [
      ...m,
      {
        role: "ai",
        text: `Simulação salva em Metas: ${name} por ${money(purchaseAmount)}. Eu marquei como ${purchaseResult.ok ? "A pagar" : "Adiar"} para você decidir com calma.`,
      },
    ]);
    setPurchaseName("");
    setPurchaseValue("");
  }

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    await askQuestion(question);
  }

  async function askQuestion(question: string) {
    if (!question || busy) return;
    const commandAnswer = handleAssistantCommand(question);
    if (commandAnswer) {
      setMessages((m) => [
        ...m,
        { role: "user", text: question },
        { role: "ai", text: commandAnswer },
      ]);
      return;
    }
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: question }, { role: "ai", text: "Analisando seus dados..." }]);
    let answer: string;
    try {
      answer = await askGemini(question, buildAiContext(state));
    } catch {
      answer = answerLocally(question, state);
    }
    setMessages((m) => {
      const next = [...m];
      next[next.length - 1] = { role: "ai", text: hideValues ? maskMoneyInText(answer) : answer };
      return next;
    });
    setBusy(false);
  }

  function handleAssistantCommand(question: string): string | null {
    const normalized = normalizeText(question);
    const activeOwner = resolveViewOwner(view) || "Minha casa";
    const activeLabel = ownerLabelForPeople(activeOwner, state.people);
    const amountInfo = extractAmount(question);

    if (amountInfo && /\b(meta|prioridade)\b/.test(normalized) && /\b(cria|criar|nova|novo|adiciona|adicionar)\b/.test(normalized)) {
      const name = cleanCommandName(question, amountInfo.raw, [
        "cria",
        "criar",
        "nova",
        "novo",
        "adiciona",
        "adicionar",
        "meta",
        "prioridade",
        "de",
        "para",
      ]);
      savePriority({
        id: uid(),
        name: name || "Nova meta",
        amount: amountInfo.amount,
        rank: 2,
        status: "A pagar",
        responsavel: activeOwner,
        createdAt: new Date().toISOString(),
      });
      return `Meta criada.\nDescricao: ${name || "Nova meta"}\nValor: ${money(amountInfo.amount)}\nResponsavel: ${activeLabel}`;
    }

    if (amountInfo && /orcamento|orçamento/.test(normalized)) {
      const profileBudgets = { ...(month.profileBudgets || {}) };
      let income = month.income;
      let houseContribution = month.houseContribution;

      if (view === VIEW_SPOUSE) {
        houseContribution = amountInfo.amount;
      } else if (view !== VIEW_ALL && view !== VIEW_ME) {
        profileBudgets[view] = amountInfo.amount;
      } else {
        income = amountInfo.amount;
      }

      saveMonthSettings(month.label, income, houseContribution, profileBudgets);
      return `Orcamento atualizado.\nPerfil: ${viewLabelForPeople(view, state.people)}\nNovo limite: ${money(amountInfo.amount)}`;
    }

    if (!amountInfo && /\b(paguei|pagar|marcar|marca|quitei|quitar)\b/.test(normalized)) {
      const term = cleanCommandName(question, "", [
        "paguei",
        "pagar",
        "marcar",
        "marca",
        "quitei",
        "quitar",
        "como",
        "pago",
        "a",
        "o",
        "as",
        "os",
      ]);
      const pending = expenses
        .filter((item) => item.status === "A pagar")
        .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
      const found = pending.find((item) => {
        const target = normalizeText(`${item.name} ${item.category} ${item.paymentMethod}`);
        return term ? target.includes(normalizeText(term)) : false;
      });

      if (found) {
        saveExpense({ ...found, status: "Pago" }, found.id);
        return `Conta marcada como paga.\nDescricao: ${found.name}\nValor: ${money(found.amount)}\nResponsavel: ${ownerLabelForPeople(found.owner, state.people)}`;
      }

      if (pending.length) {
        return `Nao encontrei essa conta aberta.\nContas a pagar: ${pending.slice(0, 4).map((item) => `${item.name} (${money(item.amount)})`).join(", ")}.`;
      }
      return "Nao ha contas abertas nesta visao agora.";
    }

    const parsedExpense = parseAssistantEntryCommand(question, state.activeMonth, activeOwner);
    if (parsedExpense) {
      saveExpense(parsedExpense);
      if (parsedExpense.type !== "income") fireNewExpenseVigia(parsedExpense);
      const kind = parsedExpense.type === "income" ? "Receita registrada" : "Gasto registrado";
      return `${kind}.\nDescricao: ${parsedExpense.name}\nValor: ${money(parsedExpense.amount)}\nCategoria: ${parsedExpense.category}\nResponsavel: ${ownerLabelForPeople(parsedExpense.owner, state.people)}\nStatus: ${parsedExpense.status}`;
    }

    return null;
  }

  function openPurchaseSimulator() {
    setPurchaseName((current) => current || "");
    simulatorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => purchaseNameRef.current?.focus(), 350);
  }

  const insights = [
    {
      title: "Resumo do mês",
      body: `${money(numbers.total)} em gastos, ${money(numbers.pending)} ainda pendente e ${money(numbers.free)} disponível.`,
    },
    {
      title: numbers.free >= 0 ? "Ritmo do orçamento" : "Atenção ao orçamento",
      body:
        numbers.free >= 0
          ? `Você pode gastar cerca de ${money(weeklyAllowance)} nesta semana.`
          : `O orçamento passou ${money(Math.abs(numbers.free))}. Priorize cortar novas compras.`,
    },
    {
      title: "Maior impacto",
      body: numbers.topCategory
        ? `${categoryLabel(numbers.topCategory.category)} concentra ${money(numbers.topCategory.total)}.`
        : "Ainda não há categoria dominante neste mês.",
    },
    {
      title: "Mudança relevante",
      body: growth ? `${categoryLabel(growth.category)} cresceu ${money(growth.diff)} contra o mês anterior.` : "Sem crescimento relevante para comparar.",
    },
  ];

  const attentionItems = insights.slice(0, 3);

  return (
    <div className="flex flex-col gap-4">
      {messages.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={startNewConversation}
            className="press focus-ring inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.05] px-3.5 py-2 text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Nova conversa
          </button>
        </div>
      )}

      <div className="flex flex-col">
        {messages.length === 0 ? (
          <section className="card-surface hero-texture relative overflow-hidden rounded-3xl p-5">
            <div className="pointer-events-none absolute -right-14 -top-20 h-52 w-52 rounded-full bg-primary/12 blur-3xl" />
            <div className="relative z-10 max-w-[70%]">
              <h1 className="font-display text-[1.7rem] leading-[1.15] tracking-tight text-foreground">
                Seu dinheiro,
                <br />
                <span className="text-primary">com mais clareza.</span>
              </h1>
              <div className="mt-3 h-px w-10 bg-primary/50" />
              <button
                type="button"
                onClick={() => attentionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="press mt-4 flex items-start gap-3 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary-soft text-primary shadow-primary">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm text-muted-foreground">
                    Você está <strong className="font-bold text-primary">{money(Math.abs(numbers.free))}</strong>{" "}
                    {overBudget ? "acima" : "dentro"} do orçamento
                  </span>
                  <span className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-primary">
                    Ver ajustes <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </span>
              </button>
            </div>
            <div className="absolute -right-4 top-1/2 -translate-y-1/2">
              <BudgetRing percent={usedPct} overBudget={overBudget} />
            </div>
          </section>
        ) : (
          <div className="flex flex-col gap-3.5">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div
                  key={i}
                  className="self-end max-w-[84%] rounded-[1.1rem] bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-primary"
                >
                  {m.text}
                </div>
              ) : (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary ring-1 ring-primary/20">
                    <AvalMark size={14} />
                  </span>
                  <div
                    className={`min-w-0 flex-1 rounded-2xl px-3.5 py-2.5 ${
                      m.sender ? "border-l-2 border-l-warning/60 bg-warning/8" : "bg-white/[0.03]"
                    }`}
                  >
                    {m.sender && <span className="mb-1 block text-[11px] font-bold text-primary">{m.sender}</span>}
                    <p className="whitespace-pre-line text-[15px] leading-[1.6] text-foreground">{m.text}</p>
                  </div>
                </div>
              ),
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="card-surface relative overflow-hidden border-t-2 border-t-primary/50 p-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <TrendingUp className="h-4 w-4" />
            </span>
            <strong className="tnum mt-2.5 block font-display text-2xl text-foreground">{money(numbers.total)}</strong>
            <span className="text-[13px] text-muted-foreground">gastos</span>
            <Sparkline values={spendingTrend} className="mt-2" />
          </div>
          <div className="panel-flat p-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <CalendarClock className="h-4 w-4" />
            </span>
            <strong className="tnum mt-2.5 block font-display text-2xl text-foreground">
              {daysToNextDue === null ? "—" : `${daysToNextDue} dia${daysToNextDue === 1 ? "" : "s"}`}
            </strong>
            <span className="truncate text-[13px] text-muted-foreground">
              {nextDue ? `para ${nextDue.name.toLocaleLowerCase("pt-BR")}` : "nada por vir"}
            </span>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${daysToNextDue === null ? 0 : Math.max(6, 100 - daysToNextDue * 12)}%` }}
              />
            </div>
          </div>
        </div>

        {attentionItems.length > 0 && (
          <div ref={attentionRef} className="mt-4 flex flex-col gap-2">
            {attentionItems.map((item) => {
              const attention = item.title.startsWith("Atenção");
              return (
                <div
                  key={item.title}
                  className={`flex items-start gap-3 rounded-2xl p-3.5 ${
                    attention ? "border-l-2 border-l-warning/60 bg-warning/8" : "bg-white/[0.03]"
                  }`}
                >
                  <span
                    className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-xl ${
                      attention ? "bg-warning/18 text-warning" : "bg-primary-soft text-primary"
                    }`}
                  >
                    <TriangleAlert className="h-4 w-4" strokeWidth={2.25} />
                  </span>
                  <div className="min-w-0">
                    <strong className="block text-sm font-bold text-foreground">{item.title}</strong>
                    <span className="text-[13px] leading-relaxed text-muted-foreground">{item.body}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={scrollEndRef} />
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {["Análise do mês", "Falta pagar", "Meu limite", "Prioridades"].map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => askQuestion(question)}
            className="press focus-ring shrink-0 rounded-full border border-white/[0.12] bg-white/[0.05] px-3.5 py-2 text-xs font-bold text-muted-foreground hover:border-primary/30 hover:text-foreground"
          >
            {question}
          </button>
        ))}
      </div>

      <form onSubmit={ask} className="card-surface rounded-[1.375rem] p-3">
        <TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(e as unknown as React.FormEvent);
            }
          }}
          placeholder="Converse com o Aval"
          rows={2}
          className="!h-auto w-full resize-none !border-0 !bg-transparent !p-0 text-sm !shadow-none !ring-0 focus:!ring-0"
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onAddExpense}
              aria-label="Registrar lançamento"
              title="Registrar lançamento"
              className="press focus-ring flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4" strokeWidth={2.25} />
            </button>
            <button
              type="button"
              onClick={openPurchaseSimulator}
              aria-label="Simular compra"
              title="Simular compra"
              className="press focus-ring flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground"
            >
              <Calculator className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="press focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-primary disabled:opacity-50"
            aria-label="Enviar"
          >
            <Send className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
      </form>

      <Panel ref={simulatorRef} tone="elevated" className="p-0">
        <div className="p-4 pb-3">
          <PanelHead title="Simulador de compra" hint="decisão antes do gasto" icon={Calculator} />
        </div>
        <div className="grid gap-3 px-4 pb-4">
          <Field label="O que quer comprar?">
            <TextInput
              ref={purchaseNameRef}
              value={purchaseName}
              onChange={(e) => setPurchaseName(e.target.value)}
              placeholder="Ex.: mesa"
            />
          </Field>
          <Field label="Valor">
            <TextInput
              value={purchaseValue}
              onChange={(e) => updatePurchaseValue(e.target.value)}
              onBeforeInput={(event) => {
                const data = event.data || "";
                if (data && !/^[\d,.]+$/.test(data)) event.preventDefault();
              }}
              inputMode="decimal"
              pattern="[0-9,.]*"
              placeholder="Ex.: 1500"
            />
          </Field>
          <div className={`rounded-[1.6rem] border p-4 ${purchaseResult.ok ? "border-success/30 bg-success/10" : "border-warning/30 bg-warning/10"}`}>
            <div className="flex items-start gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${purchaseResult.ok ? "bg-success/15 text-success" : "bg-warning/20 text-warning"}`}>
                {purchaseResult.ok ? <CheckCircle2 className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
              </span>
              <div>
                <strong className="block text-sm font-bold text-foreground">{purchaseResult.title}</strong>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{purchaseResult.body}</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={savePurchaseSimulation}
            disabled={!purchaseName.trim() || purchaseAmount <= 0}
            className="hero-gradient press focus-ring h-12 rounded-2xl text-sm font-bold text-primary-foreground shadow-primary disabled:cursor-not-allowed disabled:opacity-45"
          >
            Salvar simulação em Metas
          </button>
        </div>
      </Panel>

      <Panel>
        <PanelHead
          title="Regra dos envelopes"
          icon={Wallet}
          action={
            <button
              type="button"
              onClick={() => setEditingEnvelopes((value) => !value)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary-soft px-3 text-xs font-bold text-primary"
            >
              {editingEnvelopes ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
              {editingEnvelopes ? "Concluir" : "Editar"}
            </button>
          }
        />
        <div className="flex flex-col gap-3">
          {envelopes.map((rule) => {
            const spent = sum(expenses.filter((item) => rule.categories.includes(item.category)));
            const pct = Math.min(100, rule.limit ? (spent / rule.limit) * 100 : 0);
            const remaining = Math.max(0, rule.limit - spent);
            return (
              <div key={rule.id} className={editingEnvelopes ? "rounded-2xl border border-border bg-secondary/50 p-3" : ""}>
                {editingEnvelopes ? (
                  <div className="mb-3 grid gap-3">
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <TextInput
                        value={rule.label}
                        onChange={(event) => updateEnvelope(rule.id, { label: event.target.value })}
                        placeholder="Nome do envelope"
                      />
                      <button
                        type="button"
                        onClick={() => deleteEnvelope(rule.id)}
                        className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive"
                        aria-label="Excluir envelope"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Limite">
                        <TextInput
                          type="number"
                          min="0"
                          step="0.01"
                          value={rule.limit}
                          onChange={(event) => updateEnvelope(rule.id, { limit: Number(event.target.value || 0) })}
                        />
                      </Field>
                      <Field label="Categoria">
                        <SelectInput
                          value={rule.categories[0] || "Outros"}
                          onChange={(event) => updateEnvelope(rule.id, { categories: [event.target.value] })}
                        >
                          {categories.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </SelectInput>
                      </Field>
                    </div>
                  </div>
                ) : null}
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-foreground">{rule.label || "Sem nome"}</span>
                  <span className="tnum text-xs font-semibold text-muted-foreground">{money(remaining)} livre</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-secondary ring-1 ring-border/70">
                  <div
                    className={`h-full rounded-full ${pct >= 90 ? "bg-destructive" : pct >= 75 ? "bg-warning" : "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>{money(spent)} usado · {Math.round(pct)}%</span>
                  <span>limite {money(rule.limit)}</span>
                </div>
              </div>
            );
          })}
          {editingEnvelopes ? (
            <button
              type="button"
              onClick={addEnvelope}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/35 bg-primary-soft/70 text-sm font-bold text-primary"
            >
              <Plus className="h-4 w-4" />
              Adicionar envelope
            </button>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

function parseExpenseCommand(text: string, monthKey: string, owner: string): Expense | null {
  const normalized = normalizeText(text);
  const looksLikeExpense = /\b(registra|registre|registrar|gastei|paguei|comprei|lanca|lancar|anota|anote|coloca|coloque|cadastro|cadastre|adiciona|adicionar|salva|salvar)\b/.test(normalized);
  if (!looksLikeExpense) return null;

  const valueMatch = text.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i);
  const amount = valueMatch ? parseCurrencyInput(valueMatch[1]) : 0;
  if (amount <= 0) return null;

  const rawName = text
    .replace(valueMatch?.[0] || "", "")
    .replace(/\b(registra|registre|registrar|gastei|paguei|comprei|lanca|lança|lancar|lançar|anota|anote|coloca|coloque|cadastro|cadastre|adiciona|adicionar|salva|salvar|compra|gasto|despesa|de|com|no|na|em|por|r\$)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const name = rawName || "Gasto informado pelo chat";
  const category = guessCategory(text, name);
  const paymentMethod = guessPaymentMethod(text);

  return {
    id: uid(),
    name,
    category,
    amount,
    status: normalized.includes("paguei") || normalized.includes("pago") ? "Pago" : "A pagar",
    owner,
    date: new Date().toISOString().slice(0, 10) || `${monthKey}-05`,
    paymentMethod,
    note: "Registrado pelo assistente",
    createdAt: new Date().toISOString(),
  };
}

function parseAssistantEntryCommand(text: string, monthKey: string, owner: string): Expense | null {
  const normalized = normalizeText(text);
  const isIncome = /\b(recebi|entrou|faturei|ganhei|salario|receita)\b/.test(normalized);
  const looksLikeEntry = /\b(registra|registre|registrar|gastei|paguei|comprei|lanca|lancar|anota|anote|coloca|coloque|cadastro|cadastre|adiciona|adicionar|salva|salvar|recebi|entrou|faturei|ganhei)\b/.test(normalized);
  if (!looksLikeEntry) return null;

  const valueMatch = extractAmount(text);
  if (!valueMatch || valueMatch.amount <= 0) return null;
  const amount = valueMatch.amount;

  const date = normalized.includes("ontem") ? offsetDate(-1) : new Date().toISOString().slice(0, 10);
  const name =
    extractMerchant(text, valueMatch.raw) ||
    cleanCommandName(text, valueMatch.raw, [
      "registra",
      "registre",
      "registrar",
      "gastei",
      "paguei",
      "comprei",
      "lanca",
      "lancar",
      "anota",
      "anote",
      "coloca",
      "coloque",
      "cadastro",
      "cadastre",
      "adiciona",
      "adicionar",
      "salva",
      "salvar",
      "compra",
      "gasto",
      "despesa",
      "recebi",
      "entrou",
      "faturei",
      "ganhei",
      "de",
      "com",
      "no",
      "na",
      "em",
      "por",
    ]) ||
    (isIncome ? "Receita informada pelo chat" : "Gasto informado pelo chat");

  return {
    id: uid(),
    name,
    category: isIncome ? guessIncomeCategory(text) : guessCategory(text, name),
    amount,
    status: isIncome || normalized.includes("paguei") || normalized.includes("pago") ? "Pago" : "A pagar",
    type: isIncome ? "income" : "expense",
    owner,
    date: date || `${monthKey}-05`,
    dueDate: date || `${monthKey}-05`,
    competence: (date || `${monthKey}-05`).slice(0, 7),
    paidBy: owner,
    paymentMethod: guessPaymentMethod(text),
    note: isIncome ? "Receita registrada pelo assistente" : "Registrado pelo assistente",
    createdAt: new Date().toISOString(),
  };
}

function extractAmount(text: string): { raw: string; amount: number } | null {
  const match = text.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{1,2}|\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d{1,2})?)/i);
  if (!match) return null;
  return { raw: match[0], amount: parseCurrencyInput(match[1]) };
}

function cleanCommandName(text: string, amountRaw: string, stopWords: string[]): string {
  const escapedAmount = amountRaw ? amountRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
  const withoutAmount = escapedAmount ? text.replace(new RegExp(escapedAmount, "i"), " ") : text;
  const stop = stopWords.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return titleCase(
    withoutAmount
      .replace(/\br\$\b/gi, " ")
      .replace(new RegExp(`\\b(${stop})\\b`, "gi"), " ")
      .replace(/\b(hoje|ontem|pix|debito|debito|credito|credito|cartao|cartao|dinheiro|boleto)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function extractMerchant(text: string, amountRaw: string): string {
  const cleaned = text.replace(amountRaw, " ");
  const match = cleaned.match(/\b(?:no|na|em|do|da)\s+([A-Za-zÀ-ÿ0-9 .'-]{2,28})/i);
  if (!match) return "";
  const value = match[1]
    .replace(/\b(via|com|por|de|r\$|hoje|ontem|pix|debito|debito|credito|credito|cartao|cartao|dinheiro|boleto)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return titleCase(value);
}

function titleCase(value: string): string {
  return value
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|\s)(\S)/g, (_, space: string, letter: string) => `${space}${letter.toLocaleUpperCase("pt-BR")}`);
}

function offsetDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function guessCategory(text: string, establishmentName = ""): string {
  const learned = establishmentName ? lookupLearnedCategory(establishmentName) : null;
  if (learned) return learned;
  const normalized = normalizeText(text);
  const rules: [string, string[]][] = [
    ["Alimentação", ["mercado", "comida", "lanche", "restaurante", "ifood", "alimento"]],
    ["Transporte", ["gasolina", "uber", "99", "onibus", "ônibus", "transporte"]],
    ["Saúde", ["remedio", "remédio", "consulta", "medico", "médico", "saude", "saúde"]],
    ["Casa", ["aluguel", "luz", "agua", "água", "internet", "casa"]],
    ["Cartões", ["cartao", "cartão", "credito", "crédito"]],
    ["Empréstimo", ["emprestimo", "empréstimo"]],
    ["Lazer", ["lazer", "cinema", "show", "viagem"]],
  ];
  return rules.find(([, words]) => words.some((word) => normalized.includes(normalizeText(word))))?.[0] || "Outros";
}

function guessIncomeCategory(text: string): string {
  const normalized = normalizeText(text);
  if (/\b(uber|corrida|faturei|faturamento)\b/.test(normalized)) return "Receita Uber";
  return "Livre";
}

function guessPaymentMethod(text: string): string {
  const normalized = normalizeText(text);
  if (/\b(cartao|credito)\b/.test(normalized)) return "Crédito";
  if (/\b(debito)\b/.test(normalized)) return "Débito";
  return paymentMethods.find((method) => normalized.includes(normalizeText(method))) || "Pix";
}

function getPurchaseResult(
  name: string,
  amount: number,
  free: number,
  weeklyAllowance: number,
  formatMoney: (value: number) => string,
) {
  if (!name.trim() || amount <= 0) {
    return {
      ok: true,
      title: "Digite uma compra para simular",
      body: "Eu comparo o valor com o saldo disponível e com o limite saudável da semana.",
    };
  }
  const remaining = free - amount;
  if (remaining < 0) {
    return {
      ok: false,
      title: "Melhor não comprar agora",
      body: `Essa compra deixaria o mês negativo em ${formatMoney(Math.abs(remaining))}. O ideal é adiar ou trocar por uma opção menor.`,
    };
  }
  if (amount > weeklyAllowance && weeklyAllowance > 0) {
    return {
      ok: false,
      title: "Compra possível, mas pesada",
      body: `Você ainda ficaria com ${formatMoney(remaining)}, mas passaria do limite saudável da semana. Vale negociar ou planejar para o próximo mês.`,
    };
  }
  return {
    ok: true,
    title: "Compra segura para este mês",
    body: `Se comprar ${name.trim()} hoje, ainda sobra ${formatMoney(remaining)} no orçamento selecionado.`,
  };
}

function parseCurrencyInput(value: string): number {
  const clean = value.replace(/[^\d,.]/g, "");
  if (!clean) return 0;
  const hasComma = clean.includes(",");
  const normalized = hasComma ? clean.replace(/\./g, "").replace(",", ".") : clean;
  return Number(normalized || 0);
}
