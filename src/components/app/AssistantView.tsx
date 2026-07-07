import { useState } from "react";
import { Send } from "lucide-react";

import {
  calc,
  categoryLabel,
  expensesForView,
  getLargestCategoryGrowth,
  money,
} from "@/lib/finance/calc";
import { answerLocally, askGemini, buildAiContext } from "@/lib/finance/ai";
import { useFinance } from "@/lib/finance/FinanceContext";

import { Panel, PanelHead } from "./ui";

interface Message {
  role: "user" | "ai";
  text: string;
}

export function AssistantView() {
  const { state, month } = useFinance();
  const view = state.activePerson;
  const numbers = calc(month, view);
  const growth = getLargestCategoryGrowth(state, view);
  const biggestPending = expensesForView(month, view)
    .filter((e) => e.status === "A pagar")
    .sort((a, b) => b.amount - a.amount)[0];

  const insights = [
    { title: "Resumo do mês", body: `Você registrou ${money(numbers.total)} em gastos. ${money(numbers.pending)} ainda está pendente.` },
    {
      title: numbers.free >= 0 ? "Alerta de orçamento" : "Atenção ao orçamento",
      body:
        numbers.free >= 0
          ? `O mês ainda fecha positivo com ${money(numbers.free)} de saldo.`
          : `Os gastos passaram do orçamento em ${money(Math.abs(numbers.free))}.`,
    },
    {
      title: "Sugestão de economia",
      body: numbers.topCategory
        ? `Revise ${categoryLabel(numbers.topCategory.category)} primeiro. Concentra ${money(numbers.topCategory.total)} neste mês.`
        : "Cadastre gastos para gerar sugestões.",
    },
    {
      title: "Categoria que mais cresceu",
      body: growth ? `${categoryLabel(growth.category)} cresceu ${money(growth.diff)} vs. mês anterior.` : "Sem mês anterior para comparar.",
    },
    {
      title: "Próxima conta para atacar",
      body: biggestPending ? `${biggestPending.name} é a maior pendência: ${money(biggestPending.amount)}.` : "Não há contas pendentes.",
    },
  ];

  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", text: "Pronto. Eu analiso suas contas, prioridades e o que ainda falta pagar neste mês." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: question }, { role: "ai", text: "Analisando com Gemini..." }]);
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

  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <PanelHead title="Assistente IA" hint="insights" />
        <div className="flex flex-col gap-2.5">
          {insights.map((item) => (
            <div key={item.title} className="rounded-2xl border border-border bg-secondary p-3.5">
              <strong className="block text-sm font-bold text-foreground">{item.title}</strong>
              <span className="text-[13px] leading-relaxed text-muted-foreground">{item.body}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHead title="Pergunte ao orçamento" hint="ex.: posso pagar a prioridade 1?" />
        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto no-scrollbar pb-2">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                m.role === "user"
                  ? "self-end bg-primary text-primary-foreground"
                  : "self-start bg-secondary text-foreground"
              }`}
            >
              {m.text}
            </div>
          ))}
        </div>
        <form onSubmit={ask} className="mt-3 flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite sua pergunta"
            className="h-11 flex-1 rounded-xl border border-input bg-secondary px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="submit"
            disabled={busy}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-60"
            aria-label="Enviar"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </Panel>
    </div>
  );
}
