import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  MessageCircle,
  Pencil,
  Plus,
  PiggyBank,
  Send,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";

import {
  calc,
  categoryLabel,
  expensesForView,
  getLargestCategoryGrowth,
  money,
  normalizeText,
  ownerLabelForPeople,
  resolveViewOwner,
  sum,
  viewLabelForPeople,
} from "@/lib/finance/calc";
import { answerLocally, askGemini, buildAiContext } from "@/lib/finance/ai";
import { categories, paymentMethods, VIEW_ALL, VIEW_ME, VIEW_SPOUSE } from "@/lib/finance/constants";
import { useFinance } from "@/lib/finance/FinanceContext";
import { uid } from "@/lib/finance/seed";
import type { Expense } from "@/lib/finance/types";

import { Field, SelectInput, TextInput } from "./forms";
import { Panel, PanelHead } from "./ui";

interface Message {
  role: "user" | "ai";
  text: string;
}

interface AssistantViewProps {
  onAddExpense: () => void;
}

export function AssistantView({ onAddExpense }: AssistantViewProps) {
  const {
    activeUser,
    state,
    month,
    envelopes,
    saveMonthSettings,
    saveExpense,
    savePriority,
    saveEnvelopes,
  } = useFinance();
  const view = state.activePerson;
  const numbers = calc(month, view, state.activeMonth);
  const expenses = expensesForView(month, view);
  const growth = getLargestCategoryGrowth(state, view);
  const biggestPending = expenses
    .filter((e) => e.status === "A pagar")
    .sort((a, b) => b.amount - a.amount)[0];

  const today = new Date().toISOString().slice(0, 10);
  const dueToday = expenses
    .filter((item) => item.status === "A pagar" && item.date === today)
    .sort((a, b) => b.amount - a.amount)[0];
  const weeklyAllowance = numbers.daysLeft > 0 ? Math.max(0, (numbers.free / numbers.daysLeft) * 7) : 0;
  const monthReading = month.planned
    ? numbers.free < 0
      ? `Este planejamento já estoura o orçamento em ${money(Math.abs(numbers.free))}.`
      : `Previsão: ${money(numbers.pending)} de gastos planejados, sobrando ${money(numbers.free)}.`
    : numbers.free < 0
      ? `Você passou ${money(Math.abs(numbers.free))} do orçamento deste mês.`
      : numbers.pending > 0
        ? `Sobram ${money(numbers.free)}, mas ${money(numbers.pending)} ainda estão em contas a pagar.`
        : `Mês sob controle: ${money(numbers.free)} disponíveis.`;

  const initialMessage = useMemo(
    () =>
      `${timeGreeting()}, ${activeUser?.name || "Junior"}. Eu acompanho ${viewLabelForPeople(view, state.people).toLowerCase()} e posso te ajudar a decidir antes de gastar.`,
    [activeUser?.name, view, state.people],
  );

  const [messages, setMessages] = useState<Message[]>([{ role: "ai", text: initialMessage }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [purchaseName, setPurchaseName] = useState("");
  const [purchaseValue, setPurchaseValue] = useState("");
  const [editingEnvelopes, setEditingEnvelopes] = useState(false);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const simulatorRef = useRef<HTMLDivElement | null>(null);
  const purchaseNameRef = useRef<HTMLInputElement | null>(null);

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
  const purchaseResult = getPurchaseResult(purchaseName, purchaseAmount, numbers.free, weeklyAllowance);

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
    chatRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      next[next.length - 1] = { role: "ai", text: answer };
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

  const dueLabel = dueToday ? dueToday.name : biggestPending?.name || "Nada urgente";
  const balanceState = getBalanceState(numbers.free, numbers.pending);
  const health = balanceState.status;

  return (
    <div className="flex flex-col gap-4">
      <section className="finance-hero relative overflow-hidden rounded-[1.5rem] p-[1.125rem] text-foreground">
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.055] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/80">
              <Sparkles className="h-3.5 w-3.5" />
              Aval
            </span>
            <h2 className="mt-4 max-w-[17rem] font-display text-[1.5rem] leading-[1.3] tracking-normal">
              {monthReading}
            </h2>
            <p className="mt-1 text-sm text-white/78">
              {view === VIEW_ALL
                ? "Visão consolidada da casa"
                : `${viewLabelForPeople(view, state.people)} · ${numbers.daysLeft} dias restantes`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => chatRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.9rem] bg-white/[0.055] text-primary ring-1 ring-white/10 transition active:scale-95"
            aria-label="Abrir conversa"
          >
            <MessageCircle className="h-6 w-6" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => askQuestion(numbers.free < 0 ? "Como posso reorganizar meu mes?" : "Quanto posso gastar com seguranca?")}
          className="press relative mt-5 w-full rounded-[1.25rem] bg-white/[0.055] p-4 text-left ring-1 ring-white/10 backdrop-blur transition hover:bg-white/[0.075]"
        >
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/72">
            <PiggyBank className="h-3.5 w-3.5" />
            {balanceState.label}
          </span>
          <strong className="tnum mt-1 block font-display text-[2rem] leading-none">{balanceState.value}</strong>
          <p className="mt-2 text-xs leading-relaxed text-white/72">{balanceState.description}</p>
          <span className="mt-3 inline-flex rounded-full bg-white/12 px-3 py-1 text-[11px] font-bold text-white/78">
            Toque para analisar
          </span>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <HeroStat icon={<CalendarClock className="h-4 w-4" />} label="Hoje vence" value={dueLabel} />
            <HeroStat icon={<WalletCards className="h-4 w-4" />} label="Semana" value={money(weeklyAllowance)} />
            <HeroStat icon={<ShieldCheck className="h-4 w-4" />} label="Status" value={health} />
          </div>
        </button>
      </section>

      <Panel className="p-3.5">
        <PanelHead title="O que deseja fazer?" hint="atalhos rápidos" />
        <div className="grid gap-2.5">
          <QuickAction
            icon={<CircleDollarSign className="h-4 w-4" />}
            label="Registrar gasto"
            description="Abrir cadastro manual"
            onClick={onAddExpense}
          />
          <QuickAction
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Posso comprar isso?"
            description="Simular impacto no mês"
            onClick={openPurchaseSimulator}
          />
          <QuickAction
            icon={<Sparkles className="h-4 w-4" />}
            label="O que mudou este mês?"
            description="Comparar com o mês anterior"
            onClick={() => askQuestion("O que mudou este mês?")}
          />
        </div>
      </Panel>

      <Panel ref={chatRef} className="overflow-hidden p-0">
        <div className="border-b border-border/70 bg-secondary/70 px-4 py-3">
          <PanelHead title="Converse com o orçamento" hint={busy ? "analisando..." : "Gemini + dados locais"} />
        </div>
        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto no-scrollbar px-4 py-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[88%] whitespace-pre-line px-3.5 py-2.5 text-[13px] leading-relaxed shadow-soft ${
                m.role === "user"
                  ? "self-end rounded-[1.25rem] rounded-br-md bg-primary text-primary-foreground"
                  : "self-start rounded-[1.25rem] rounded-bl-md bg-card text-foreground ring-1 ring-border/70"
              }`}
            >
              {m.text}
            </div>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 pb-3">
          {["Analise o mes", "Falta pagar", "Meu limite", "Registre mercado 120"].map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => askQuestion(question)}
              className="press focus-ring shrink-0 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-bold text-muted-foreground shadow-soft hover:border-primary/30 hover:text-primary"
            >
              {question}
            </button>
          ))}
        </div>
        <form onSubmit={ask} className="flex items-center gap-2 border-t border-border/70 bg-card/80 p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte ou registre por texto"
            className="h-12 flex-1 rounded-2xl border border-input bg-secondary px-4 text-sm text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/70 focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/12"
          />
          <button
            type="submit"
            disabled={busy}
            className="press focus-ring flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-primary disabled:opacity-60"
            aria-label="Enviar"
          >
            <Send className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </form>
      </Panel>

      <Panel ref={simulatorRef} className="p-0">
        <div className="p-4 pb-3">
          <PanelHead title="Simulador de compra" hint="decisão antes do gasto" />
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

      <Panel>
        <PanelHead title="Análise automática" hint="especialista financeiro" />
        <div className="flex flex-col gap-2.5">
          {insights.map((item) => (
            <div key={item.title} className="rounded-2xl border border-border bg-secondary p-3.5">
              <strong className="block text-sm font-bold text-foreground">{item.title}</strong>
              <span className="text-[13px] leading-relaxed text-muted-foreground">{item.body}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function timeGreeting(): string {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const morningStart = 5 * 60 + 1;
  const afternoonStart = 13 * 60;
  const nightStart = 18 * 60;

  if (minutes >= nightStart || minutes <= 5 * 60) return "Boa noite";
  if (minutes >= morningStart && minutes <= 12 * 60 + 59) return "Bom dia";
  if (minutes >= afternoonStart && minutes < nightStart) return "Boa tarde";
  return "Boa noite";
}

function getBalanceState(free: number, pending: number) {
  if (free < 0) {
    return {
      label: "Ajuste necessario",
      value: money(Math.abs(free)),
      status: "Reorganizar",
      description: pending > 0
        ? "O mes precisa de revisao. Veja o que pode ser adiado antes de assumir novos gastos."
        : "Os gastos passaram do orcamento. Use o painel para decidir o que reduzir.",
    };
  }

  if (pending > free) {
    return {
      label: "Saldo sob pressao",
      value: money(free),
      status: "Cautela",
      description: "Ainda existe saldo, mas as contas pendentes exigem cuidado nas proximas compras.",
    };
  }

  return {
    label: "Saldo disponivel",
    value: money(free),
    status: "Saudavel",
    description: "O mes esta dentro do planejado. Mantenha o ritmo antes de novas compras.",
  };
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
  const category = guessCategory(text);
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
    category: isIncome ? guessIncomeCategory(text) : guessCategory(text),
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

function guessCategory(text: string): string {
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

function HeroStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-h-[4.75rem] min-w-0 rounded-2xl bg-white/12 p-3 ring-1 ring-white/10">
      <span className="flex items-center gap-1.5 text-[10px] font-semibold text-white/72">
        {icon}
        {label}
      </span>
      <strong className="tnum mt-1 block whitespace-nowrap text-[11px] font-bold leading-tight tracking-normal">
        {value}
      </strong>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group press focus-ring flex min-h-16 items-center justify-between gap-3 rounded-[1.35rem] border border-border bg-gradient-to-br from-card to-secondary px-4 py-3 text-left shadow-soft hover:border-primary/30 hover:shadow-card"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary ring-1 ring-primary/10 transition-transform duration-200 group-hover:scale-105">{icon}</span>
        <span className="min-w-0">
          <strong className="block truncate text-sm font-bold text-foreground">{label}</strong>
          <small className="mt-0.5 block truncate text-[11px] font-medium text-muted-foreground">{description}</small>
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-active:translate-x-0.5" />
    </button>
  );
}

function getPurchaseResult(name: string, amount: number, free: number, weeklyAllowance: number) {
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
      body: `Essa compra deixaria o mês negativo em ${money(Math.abs(remaining))}. O ideal é adiar ou trocar por uma opção menor.`,
    };
  }
  if (amount > weeklyAllowance && weeklyAllowance > 0) {
    return {
      ok: false,
      title: "Compra possível, mas pesada",
      body: `Você ainda ficaria com ${money(remaining)}, mas passaria do limite saudável da semana. Vale negociar ou planejar para o próximo mês.`,
    };
  }
  return {
    ok: true,
    title: "Compra segura para este mês",
    body: `Se comprar ${name.trim()} hoje, ainda sobra ${money(remaining)} no orçamento selecionado.`,
  };
}

function parseCurrencyInput(value: string): number {
  const clean = value.replace(/[^\d,.]/g, "");
  if (!clean) return 0;
  const hasComma = clean.includes(",");
  const normalized = hasComma ? clean.replace(/\./g, "").replace(",", ".") : clean;
  return Number(normalized || 0);
}
