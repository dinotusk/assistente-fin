import { BarChart3, CalendarRange, History, PieChart, TrendingUp, Users } from "lucide-react";

import { useFinance, useMoney } from "@/lib/finance/FinanceContext";
import {
  calc,
  budgetForView,
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
import { BudgetRing, Panel, PanelHead } from "./ui";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "?";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1];
  return `${first}${second || ""}`.toLocaleUpperCase("pt-BR").slice(0, 2);
}

export function DashboardView() {
  const { state, month, setActiveMonth } = useFinance();
  const money = useMoney();
  const view = state.activePerson;
  const numbers = calc(month, view, state.activeMonth, state.people);
  const byCategory = getCategoryTotals(month, view, state.people);
  const budget = budgetForView(month, view);

  const chartEntries = chartMonthEntries(state, 6).map(([key, data]) => ({
    key,
    label: data.label,
    total: sum(expensesForView(data, view, state.people)),
  }));
  const timeline = timelineMonthEntries(state);

  const usedPct = budget > 0 ? Math.min(100, (numbers.total / budget) * 100) : 0;
  const overBudget = numbers.free < 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Compact budget summary -- the full "Seu dinheiro" hero lives on Inicio, this stays lighter */}
      <section className="card-surface hero-texture relative flex items-center gap-4 overflow-hidden rounded-3xl p-5 pb-7">
        <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
        <BudgetRing percent={usedPct} overBudget={overBudget} size={64} />
        <div className="relative min-w-0">
          <span className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            {view === VIEW_SPOUSE ? "Repasse do mês" : "Orçamento do mês"}
          </span>
          <strong className="tnum mt-0.5 block font-display text-[1.9rem] leading-none text-foreground">
            {money(budget)}
          </strong>
          <span className="mt-1.5 block text-[13px] text-muted-foreground">
            {money(numbers.total)} gastos ·{" "}
            <span
              className={
                overBudget ? "font-semibold text-destructive" : "font-semibold text-success"
              }
            >
              {overBudget
                ? `${money(Math.abs(numbers.free))} acima`
                : `${money(numbers.free)} livre`}
            </span>
          </span>
        </div>
      </section>

      {/* Month history timeline -- pulled up to overlap the hero card for a layered feel */}
      <Panel className="relative z-10 -mt-3">
        <PanelHead title="Histórico de meses" hint="toque para abrir" icon={History} />
        <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
          {timeline.map(([key, data]) => {
            const expenses = expensesForView(data, view, state.people);
            const total = sum(expenses);
            const pending = sum(expenses.filter((e) => e.status === "A pagar"));
            const active = key === state.activeMonth;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveMonth(key)}
                className={`press focus-ring hover-lift flex min-w-[130px] flex-col gap-0.5 rounded-2xl border p-3 text-left ${
                  active
                    ? "border-primary bg-primary-soft"
                    : "border-border bg-secondary hover:border-primary/25"
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

      <Panel tone="elevated" accent="primary">
        <PanelHead title="Distribuição do mês" hint="por categoria" icon={PieChart} />
        <DonutChart data={byCategory} total={numbers.total} />
      </Panel>

      <Panel tone="flat">
        <PanelHead
          title="Por categoria"
          hint={`${byCategory.length} categorias`}
          icon={BarChart3}
        />
        <CategoryBars data={byCategory} />
      </Panel>

      <Panel>
        <PanelHead title="Divisão familiar" hint="por responsável" icon={Users} />
        <div className="grid grid-cols-2 gap-3">
          {state.people.map((name, index) => {
            const key = index === 0 ? VIEW_ME : index === 1 ? VIEW_SPOUSE : name;
            const mine = expensesForView(month, key, state.people);
            const pending = sum(mine.filter((e) => e.status === "A pagar"));
            const active = key === view;
            return (
              <div
                key={key}
                className={`rounded-2xl border p-3.5 transition-colors ${active ? "border-primary bg-primary-soft" : "border-border bg-secondary"}`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold ${
                      active
                        ? "bg-primary text-primary-foreground shadow-primary"
                        : "bg-card text-primary"
                    }`}
                  >
                    {initials(name)}
                  </span>
                  <strong className="min-w-0 truncate text-sm font-bold text-foreground">
                    {name}
                  </strong>
                </div>
                <span className="tnum mt-2.5 block font-display text-xl leading-none text-primary">
                  {money(sum(mine))}
                </span>
                <small className="mt-1 block text-[11px] text-muted-foreground">
                  Falta pagar {money(pending)}
                </small>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel tone="flat">
        <PanelHead title="Comparação mensal" hint="histórico" icon={CalendarRange} />
        <MonthlyBars
          entries={chartEntries}
          activeKey={state.activeMonth}
          onSelect={setActiveMonth}
        />
      </Panel>

      <Panel tone="elevated" accent="primary">
        <PanelHead title="Evolução dos gastos" hint="total por mês" icon={TrendingUp} />
        <TrendChart
          entries={chartEntries}
          activeKey={state.activeMonth}
          onSelect={setActiveMonth}
        />
      </Panel>
    </div>
  );
}
