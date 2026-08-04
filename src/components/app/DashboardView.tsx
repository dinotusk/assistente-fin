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

export function DashboardView() {
  const { state, month, setActiveMonth } = useFinance();
  const money = useMoney();
  const view = state.activePerson;
  const numbers = calc(month, view, state.activeMonth);
  const byCategory = getCategoryTotals(month, view);
  const budget = budgetForView(month, view);

  const chartEntries = chartMonthEntries(state, 6).map(([key, data]) => ({
    key,
    label: data.label,
    total: sum(expensesForView(data, view)),
  }));
  const timeline = timelineMonthEntries(state);

  const usedPct = budget > 0 ? Math.min(100, (numbers.total / budget) * 100) : 0;
  const overBudget = numbers.free < 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Compact budget summary -- the full "Seu dinheiro" hero lives on Inicio, this stays lighter */}
      <section className="card-surface relative flex items-center gap-4 overflow-hidden rounded-3xl p-5">
        <BudgetRing percent={usedPct} overBudget={overBudget} size={64} />
        <div className="min-w-0">
          <span className="text-xs font-medium text-muted-foreground">
            {view === VIEW_SPOUSE ? "Repasse do mês" : "Orçamento do mês"}
          </span>
          <strong className="tnum block font-display text-2xl text-foreground">{money(budget)}</strong>
          <span className="text-[13px] text-muted-foreground">
            {money(numbers.total)} gastos ·{" "}
            <span className={overBudget ? "text-destructive" : "text-success"}>
              {overBudget ? `${money(Math.abs(numbers.free))} acima` : `${money(numbers.free)} livre`}
            </span>
          </span>
        </div>
      </section>

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
