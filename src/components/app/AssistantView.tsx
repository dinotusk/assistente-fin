import { useEffect, useRef, useState } from "react";
import {
  Calculator,
  CalendarClock,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Wallet,
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
import { paymentMethods, VIEW_ALL, VIEW_ME, VIEW_SPOUSE } from "@/lib/finance/constants";
import { useFinance, useMoney } from "@/lib/finance/FinanceContext";
import { uid } from "@/lib/finance/seed";
import type { Expense } from "@/lib/finance/types";
import {
  evaluateNewExpense,
  evaluateVigias,
  listVigias,
  markFired,
  type VigiaAlert,
} from "@/lib/finance/vigias";

import { TextArea } from "./forms";
import { AvalMark, BudgetRing, Sparkline } from "./ui";

interface Message {
  sender?: string;
  role: "user" | "ai";
  text: string;
}

interface AssistantViewProps {
  onAddExpense: () => void;
  onOpenSimulator: () => void;
  onOpenEnvelopes: () => void;
}

function alertsToMessages(alerts: VigiaAlert[]): Message[] {
  return alerts.map((alert) => ({ role: "ai", sender: alert.vigia.name, text: alert.message }));
}

export function AssistantView({
  onAddExpense,
  onOpenSimulator,
  onOpenEnvelopes,
}: AssistantViewProps) {
  const { state, month, envelopes, hideValues, saveMonthSettings, saveExpense, savePriority } =
    useFinance();
  const money = useMoney();
  const view = state.activePerson;
  const numbers = calc(month, view, state.activeMonth, state.people);
  const expenses = expensesForView(month, view, state.people);
  const growth = getLargestCategoryGrowth(state, view);
  const biggestPending = expenses
    .filter((e) => e.status === "A pagar")
    .sort((a, b) => b.amount - a.amount)[0];

  const budget = budgetForView(month, view);
  const usedPct = budget > 0 ? Math.min(100, (numbers.total / budget) * 100) : 0;
  const overBudget = numbers.free < 0;
  const spendingTrend = chartMonthEntries(state, 6).map(([, data]) =>
    sum(expensesForView(data, view, state.people)),
  );
  const today = new Date().toISOString().slice(0, 10);
  const nextDue = expenses
    .filter((item) => item.status === "A pagar")
    .sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date))[0];
  // Negative = overdue, 0 = due today, positive = days remaining. Not clamped
  // to 0 here so overdue bills can be told apart from "due today" downstream.
  const daysToNextDue = nextDue
    ? Math.ceil(
        (new Date(nextDue.dueDate || nextDue.date).getTime() - new Date(today).getTime()) /
          86400000,
      )
    : null;

  const weeklyAllowance =
    numbers.daysLeft > 0 ? Math.max(0, (numbers.free / numbers.daysLeft) * 7) : 0;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => {
    const vigias = listVigias();
    const alerts = evaluateVigias(vigias, state, month, envelopes);
    if (!alerts.length) return;
    setMessages((m) => [...m, ...alertsToMessages(alerts)]);
    markFired(
      vigias,
      alerts.map((a) => a.vigia.id),
    );
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

  function focusChatInput() {
    inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => inputRef.current?.focus(), 350);
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
    setMessages((m) => [
      ...m,
      { role: "user", text: question },
      { role: "ai", text: "Analisando seus dados..." },
    ]);
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
    const activeOwner = resolveViewOwner(view, state.people) || state.people[0] || "Minha casa";
    const activeLabel = ownerLabelForPeople(activeOwner, state.people);
    const amountInfo = extractAmount(question);

    if (
      amountInfo &&
      /\b(meta|prioridade)\b/.test(normalized) &&
      /\b(cria|criar|nova|novo|adiciona|adicionar)\b/.test(normalized)
    ) {
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
        return `Nao encontrei essa conta aberta.\nContas a pagar: ${pending
          .slice(0, 4)
          .map((item) => `${item.name} (${money(item.amount)})`)
          .join(", ")}.`;
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

  // One clear answer for the hero, picked by what's most urgent right now —
  // instead of showing every possible insight at once.
  const primaryRecommendation = overBudget
    ? `O orçamento passou ${money(Math.abs(numbers.free))}. Priorize cortar novas compras.`
    : daysToNextDue !== null && daysToNextDue <= 3 && nextDue
      ? `${nextDue.name} ${
          daysToNextDue < 0
            ? "está atrasada"
            : daysToNextDue === 0
              ? "vence hoje"
              : `vence em ${daysToNextDue} dia${daysToNextDue === 1 ? "" : "s"}`
        }.`
      : growth
        ? `${categoryLabel(growth.category)} cresceu ${money(growth.diff)} contra o mês anterior.`
        : `Você pode gastar cerca de ${money(weeklyAllowance)} nesta semana.`;

  const secondaryInsights = [
    {
      title: "Resumo do mês",
      body: `${money(numbers.total)} em gastos, ${money(numbers.pending)} ainda pendente e ${money(numbers.free)} disponível.`,
    },
    {
      title: "Maior impacto",
      body: numbers.topCategory
        ? `${categoryLabel(numbers.topCategory.category)} concentra ${money(numbers.topCategory.total)}.`
        : "Ainda não há categoria dominante neste mês.",
    },
  ];

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

      {messages.length === 0 ? (
        <section className="panel-elevated hero-texture relative overflow-hidden rounded-3xl p-5 sm:p-6">
          <div className="pointer-events-none absolute -right-14 -top-20 h-52 w-52 rounded-full bg-primary/12 blur-3xl" />
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                  overBudget
                    ? "bg-destructive/15 text-destructive"
                    : usedPct >= 80
                      ? "bg-warning/15 text-warning"
                      : "bg-primary-soft text-primary"
                }`}
              >
                {overBudget
                  ? "Orçamento estourado"
                  : usedPct >= 80
                    ? "Fique de olho"
                    : "Mês tranquilo"}
              </span>
              <p className="mt-3 text-sm text-muted-foreground">
                {overBudget ? "Você passou do previsto em" : "Livre até o fim do mês"}
              </p>
              <strong className="tnum mt-1 block font-display text-[2.5rem] leading-[1] tracking-tight text-foreground sm:text-[2.75rem]">
                {money(Math.abs(numbers.free))}
              </strong>
              <p className="mt-3 max-w-[36ch] text-sm leading-relaxed text-foreground/80">
                {primaryRecommendation}
              </p>
            </div>
            <BudgetRing percent={usedPct} overBudget={overBudget} size={72} />
          </div>
          <div className="relative z-10 mt-5 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={onAddExpense}
              className="hero-gradient press focus-ring inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-bold text-primary-foreground shadow-primary"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} /> Registrar gasto
            </button>
            <button
              type="button"
              onClick={focusChatInput}
              className="press focus-ring inline-flex h-11 items-center gap-2 rounded-full border border-primary/25 bg-primary-soft px-4 text-sm font-bold text-primary"
            >
              <Sparkles className="h-4 w-4" /> Perguntar ao Aval
            </button>
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
                  {m.sender && (
                    <span className="mb-1 block text-[11px] font-bold text-primary">
                      {m.sender}
                    </span>
                  )}
                  <p className="whitespace-pre-line text-[15px] leading-[1.6] text-foreground">
                    {m.text}
                  </p>
                </div>
              </div>
            ),
          )}
          <div ref={scrollEndRef} />
        </div>
      )}

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
          ref={inputRef}
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
              onClick={onOpenSimulator}
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

      <div className="grid grid-cols-2 gap-3">
        <div className="panel-flat p-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <TrendingUp className="h-4 w-4" />
          </span>
          <strong className="tnum mt-2.5 block font-display text-2xl text-foreground">
            {money(numbers.total)}
          </strong>
          <span className="text-[13px] text-muted-foreground">gastos</span>
          <Sparkline values={spendingTrend} className="mt-2" />
        </div>
        <div className="panel-flat p-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <CalendarClock className="h-4 w-4" />
          </span>
          <strong
            className={`tnum mt-2.5 block font-display text-2xl ${daysToNextDue !== null && daysToNextDue < 0 ? "text-destructive" : "text-foreground"}`}
          >
            {daysToNextDue === null
              ? "—"
              : daysToNextDue < 0
                ? "Atrasada"
                : daysToNextDue === 0
                  ? "Hoje"
                  : `${daysToNextDue} dia${daysToNextDue === 1 ? "" : "s"}`}
          </strong>
          <span className="truncate text-[13px] text-muted-foreground">
            {nextDue ? `para ${nextDue.name.toLocaleLowerCase("pt-BR")}` : "nada por vir"}
          </span>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${daysToNextDue !== null && daysToNextDue < 0 ? "bg-destructive" : "bg-primary"}`}
              style={{
                width: `${daysToNextDue === null ? 0 : Math.min(100, Math.max(6, 100 - Math.max(daysToNextDue, 0) * 12))}%`,
              }}
            />
          </div>
        </div>
      </div>

      {secondaryInsights.length > 0 && (
        <div className="flex flex-col gap-2">
          {secondaryInsights.map((item) => (
            <div
              key={item.title}
              className="flex items-start gap-3 rounded-2xl bg-white/[0.03] p-3.5"
            >
              <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <TriangleAlert className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <strong className="block text-sm font-bold text-foreground">{item.title}</strong>
                <span className="text-[13px] leading-relaxed text-muted-foreground">
                  {item.body}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={onOpenSimulator}
          className="press focus-ring flex flex-col items-start gap-2 rounded-2xl bg-white/[0.03] p-3.5 text-left hover:bg-white/[0.05]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Calculator className="h-4 w-4" />
          </span>
          <span>
            <strong className="block text-sm font-bold text-foreground">Simular compra</strong>
            <span className="block text-[12px] text-muted-foreground">antes de decidir</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenEnvelopes}
          className="press focus-ring flex flex-col items-start gap-2 rounded-2xl bg-white/[0.03] p-3.5 text-left hover:bg-white/[0.05]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Wallet className="h-4 w-4" />
          </span>
          <span>
            <strong className="block text-sm font-bold text-foreground">Envelopes</strong>
            <span className="block text-[12px] text-muted-foreground">
              {envelopes.length} {envelopes.length === 1 ? "categoria" : "categorias"}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

function parseExpenseCommand(text: string, monthKey: string, owner: string): Expense | null {
  const normalized = normalizeText(text);
  const looksLikeExpense =
    /\b(registra|registre|registrar|gastei|paguei|comprei|lanca|lancar|anota|anote|coloca|coloque|cadastro|cadastre|adiciona|adicionar|salva|salvar)\b/.test(
      normalized,
    );
  if (!looksLikeExpense) return null;

  const valueMatch = text.match(
    /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i,
  );
  const amount = valueMatch ? parseCurrencyInput(valueMatch[1]) : 0;
  if (amount <= 0) return null;

  const rawName = text
    .replace(valueMatch?.[0] || "", "")
    .replace(
      /\b(registra|registre|registrar|gastei|paguei|comprei|lanca|lança|lancar|lançar|anota|anote|coloca|coloque|cadastro|cadastre|adiciona|adicionar|salva|salvar|compra|gasto|despesa|de|com|no|na|em|por|r\$)\b/gi,
      " ",
    )
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
  const looksLikeEntry =
    /\b(registra|registre|registrar|gastei|paguei|comprei|lanca|lancar|anota|anote|coloca|coloque|cadastro|cadastre|adiciona|adicionar|salva|salvar|recebi|entrou|faturei|ganhei)\b/.test(
      normalized,
    );
  if (!looksLikeEntry) return null;

  const valueMatch = extractAmount(text);
  if (!valueMatch || valueMatch.amount <= 0) return null;
  const amount = valueMatch.amount;

  const date = normalized.includes("ontem")
    ? offsetDate(-1)
    : new Date().toISOString().slice(0, 10);
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
    status:
      isIncome || normalized.includes("paguei") || normalized.includes("pago") ? "Pago" : "A pagar",
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
  const match = text.match(
    /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{1,2}|\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d{1,2})?)/i,
  );
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
      .replace(
        /\b(hoje|ontem|pix|debito|debito|credito|credito|cartao|cartao|dinheiro|boleto)\b/gi,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function extractMerchant(text: string, amountRaw: string): string {
  const cleaned = text.replace(amountRaw, " ");
  const match = cleaned.match(/\b(?:no|na|em|do|da)\s+([A-Za-zÀ-ÿ0-9 .'-]{2,28})/i);
  if (!match) return "";
  const value = match[1]
    .replace(
      /\b(via|com|por|de|r\$|hoje|ontem|pix|debito|debito|credito|credito|cartao|cartao|dinheiro|boleto)\b.*$/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
  return titleCase(value);
}

function titleCase(value: string): string {
  return value
    .toLocaleLowerCase("pt-BR")
    .replace(
      /(^|\s)(\S)/g,
      (_, space: string, letter: string) => `${space}${letter.toLocaleUpperCase("pt-BR")}`,
    );
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
  return (
    rules.find(([, words]) =>
      words.some((word) => normalized.includes(normalizeText(word))),
    )?.[0] || "Outros"
  );
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

function parseCurrencyInput(value: string): number {
  const clean = value.replace(/[^\d,.]/g, "");
  if (!clean) return 0;
  const hasComma = clean.includes(",");
  const normalized = hasComma ? clean.replace(/\./g, "").replace(",", ".") : clean;
  return Number(normalized || 0);
}
