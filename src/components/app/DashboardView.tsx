import { Sparkles, TrendingUp, CalendarClock, Brain, ArrowRight } from "lucide-react";

import { useFinance, useMoney } from "@/lib/finance/FinanceContext";
import {
  calc,
  budgetForView,
  categoryLabel,
  chartMonthEntries,
  expensesForView,
  getCategoryTotals,
  sum,
  timelineMonthEntries,
  viewLabelForPeople,
} from "@/lib/finance/calc";
import { VIEW_ME, VIEW_SPOUSE } from "@/lib/finance/constants";

import { DonutChart } from "./charts/DonutChart";
import { CategoryBars } from "./charts/CategoryBars";
import { MonthlyBars } from "./charts/MonthlyBars";
import { TrendChart } from "./charts/TrendChart";
import { BudgetRing, Panel, PanelHead, Sparkline } from "./ui";

export function DashboardView({ onOpenAssistant }: { onOpenAssistant: () => void }) {
  const { state, month, setActiveMonth } = useFinance();
  const money = useMoney();
  const view = state.activePerson;
  const numbers = calc(month, view, state.activeMonth);
  const byCategory = getCategoryTotals(month, view);
  const budget = budgetForView(month, view);
  const balance = getDashboardBalance(numbers.free, money);

  const chartEntries = chartMonthEntries(state, 6).map(([key, data]) => ({
    key,
    label: data.label,
    total: sum(expensesForView(data, view)),
  }));
  const timeline = timelineMonthEntries(state);

  const usedPct = budget > 0 ? Math.min(100, (numbers.total / budget) * 100) : 0;
  const overBudget = numbers.free < 0;
  const today = new Date().toISOString().slice(0, 10);
  const nextDue = expensesForView(month, view)
    .filter((item) => item.status === "A pagar")
    .sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date))[0];
  const daysToNextDue = nextDue
    ? Math.max(0, Math.ceil((new Date(nextDue.dueDate || nextDue.date).getTime() - new Date(today).getTime()) / 86400000))
    : null;
  const adjustmentsCount =
    expensesForView(month, view).filter((item) => item.status === "A pagar" && (item.dueDate || item.date) <= today).length +
    (overBudget ? 1 : 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Hero: headline + budget reading + progress ring */}
      <section className="card-surface relative overflow-hidden rounded-3xl p-5">
        <div className="relative z-10 max-w-[70%]">
          <h1 className="font-display text-[1.7rem] leading-[1.15] text-foreground">
            Seu dinheiro,
            <br />
            <span className="text-primary">com mais clareza.</span>
          </h1>
          <div className="mt-3 h-px w-10 bg-primary/50" />
          <button
            type="button"
            onClick={onOpenAssistant}
            className="press mt-4 flex items-start gap-3 text-left"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary-soft text-primary">
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

      {/* Gastos (sparkline) + próxima conta */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card-surface p-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <TrendingUp className="h-4 w-4" />
          </span>
          <strong className="tnum mt-2.5 block font-display text-2xl text-foreground">{money(numbers.total)}</strong>
          <span className="text-[13px] text-muted-foreground">gastos</span>
          <Sparkline values={chartEntries.map((entry) => entry.total)} className="mt-2" />
        </div>
        <div className="card-surface p-4">
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

      {/* Sugestão da Aval */}
      {adjustmentsCount > 0 && (
        <button
          type="button"
          onClick={onOpenAssistant}
          className="press card-surface relative flex items-center gap-3 overflow-hidden p-4 text-left"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Brain className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-foreground">
              A Aval encontrou <strong className="font-bold text-primary">{adjustmentsCount} ajuste{adjustmentsCount === 1 ? "" : "s"}</strong> para o seu mês
            </span>
            <span className="mt-0.5 block text-[12px] text-muted-foreground">
              Pequenas mudanças agora podem gerar mais tranquilidade depois.
            </span>
          </span>
          <span className="hero-gradient flex h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-xs font-bold text-primary-foreground">
            Ver plano <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </button>
      )}

      {/* Month history timeline */}
      <Panel>
        <PanelHead title="Histórico de meses" hint="toque para abrir" />
        <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
          {timeline.map(([key, data]) => {
            const expenses = expensesForView(data, view);
            const total = sum(expenses);
            const pending = sum(expenses.filter((e) => e.status === "A pagar"));
            const active = key === state.activeMonth;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveMonth(key)}
                className={`press focus-ring flex min-w-[130px] flex-col gap-0.5 rounded-2xl border p-3 text-left ${
                  active ? "border-primary bg-primary-soft" : "border-border bg-secondary hover:border-primary/25"
                }`}
              >
                <span className="text-xs font-medium text-muted-foreground">{data.label}</span>
                <strong className="tnum text-base font-bold text-foreground">{money(total)}</strong>
                <small className="text-[11px] text-muted-foreground">
                  {data.planned ? "Planejado" : `${money(pending)} pendente`}
                </small>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <PanelHead title="Distribuição do mês" hint="por categoria" />
        <DonutChart data={byCategory} total={numbers.total} />
      </Panel>

      <Panel>
        <PanelHead title="Por categoria" hint={`${byCategory.length} categorias`} />
        <CategoryBars data={byCategory} />
      </Panel>

      <Panel>
        <PanelHead title="Divisão familiar" hint="por responsável" />
        <div className="grid grid-cols-2 gap-3">
          {state.people.map((name, index) => {
            const key = index === 0 ? VIEW_ME : index === 1 ? VIEW_SPOUSE : name;
            const mine = expensesForView(month, key);
            const pending = sum(mine.filter((e) => e.status === "A pagar"));
            const active = key === view;
            return (
              <div
                key={key}
                className={`rounded-2xl border p-3.5 ${active ? "border-primary bg-primary-soft" : "border-border bg-secondary"}`}
              >
                <strong className="block text-sm font-bold text-foreground">{name}</strong>
                <span className="tnum mt-1 block text-lg font-bold text-primary">{money(sum(mine))}</span>
                <small className="text-[11px] text-muted-foreground">Falta pagar {money(pending)}</small>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <PanelHead title="Comparação mensal" hint="histórico" />
        <MonthlyBars entries={chartEntries} activeKey={state.activeMonth} onSelect={setActiveMonth} />
      </Panel>

      <Panel>
        <PanelHead title="Evolução dos gastos" hint="total por mês" />
        <TrendChart entries={chartEntries} activeKey={state.activeMonth} onSelect={setActiveMonth} />
      </Panel>
    </div>
  );
}

function getDashboardBalance(free: number, formatMoney: (value: number) => string) {
  if (free < 0) {
    const amount = Math.abs(free);
    return {
      label: "Ajuste necessario",
      shortLabel: "Ajustar",
      amount,
      hint: () => "Revise contas e gastos pendentes",
    };
  }

  return {
    label: "Saldo restante",
    shortLabel: "Saldo",
    amount: free,
    hint: (daysLeft: number) => (daysLeft > 0 ? `${formatMoney(free / daysLeft)} por dia` : "Mês encerrado"),
  };
}
