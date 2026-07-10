import { useFinance } from "@/lib/finance/FinanceContext";
import {
  calc,
  budgetForView,
  categoryLabel,
  chartMonthEntries,
  expensesForView,
  getCategoryTotals,
  money,
  sum,
  timelineMonthEntries,
  viewLabelForPeople,
} from "@/lib/finance/calc";
import { VIEW_ME, VIEW_SPOUSE } from "@/lib/finance/constants";

import { DonutChart } from "./charts/DonutChart";
import { CategoryBars } from "./charts/CategoryBars";
import { MonthlyBars } from "./charts/MonthlyBars";
import { TrendChart } from "./charts/TrendChart";
import { Panel, PanelHead } from "./ui";

export function DashboardView() {
  const { state, month, setActiveMonth } = useFinance();
  const view = state.activePerson;
  const numbers = calc(month, view);
  const byCategory = getCategoryTotals(month, view);
  const budget = budgetForView(month, view);
  const balance = getDashboardBalance(numbers.free);

  const chartEntries = chartMonthEntries(state, 6).map(([key, data]) => ({
    key,
    label: data.label,
    total: sum(expensesForView(data, view)),
  }));
  const timeline = timelineMonthEntries(state);

  return (
    <div className="flex flex-col gap-4">
      {/* Hero balance card */}
      <section className="hero-gradient relative overflow-hidden rounded-3xl p-5 text-primary-foreground shadow-primary">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium opacity-90">
            {view === VIEW_SPOUSE ? "Repasse do mês" : "Orçamento do mês"}
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{viewLabelForPeople(view, state.people)}</span>
        </div>
        <strong className="tnum mt-2 block font-display text-3xl font-bold">{money(budget)}</strong>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: "Gasto", value: numbers.total },
            { label: "Falta pagar", value: numbers.pending },
            { label: balance.shortLabel, value: balance.amount },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl bg-white/12 px-3 py-2.5">
              <span className="block text-[11px] font-medium opacity-85">{item.label}</span>
              <strong className="tnum block text-sm font-bold">{money(item.value)}</strong>
            </div>
          ))}
        </div>
      </section>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Total gasto" value={money(numbers.total)} hint={numbers.topCategory ? `Maior: ${categoryLabel(numbers.topCategory.category)}` : "Sem categoria"} />
        <MetricCard label="Economia" value={money(numbers.saving)} hint={`${Math.round(numbers.paidRate * 100)}% resolvido`} />
        <MetricCard label={balance.label} value={money(balance.amount)} hint={balance.hint(numbers.daysLeft)} />
        <MetricCard label="Falta pagar" value={money(numbers.pending)} hint="Contas A pagar" />
      </div>

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
                className={`flex min-w-[130px] flex-col gap-0.5 rounded-2xl border p-3 text-left transition ${
                  active ? "border-primary bg-primary-soft" : "border-border bg-secondary"
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

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card-surface hover-lift p-3.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <strong className="tnum mt-1 block font-display text-lg font-bold text-foreground">{value}</strong>
      <small className="mt-0.5 block truncate text-[11px] text-muted-foreground">{hint}</small>
    </div>
  );
}

function getDashboardBalance(free: number) {
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
    hint: (daysLeft: number) => `${money(free / daysLeft)} por dia`,
  };
}
