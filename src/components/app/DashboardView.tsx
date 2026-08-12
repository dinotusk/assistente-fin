import {
  ArrowLeftRight,
  BarChart3,
  CalendarRange,
  History,
  PieChart,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
  TriangleAlert,
  Users,
  Zap,
} from "lucide-react";

import { useFinance, useMoney } from "@/lib/finance/FinanceContext";
import {
  calc,
  budgetForView,
  categoryLabel,
  chartMonthEntries,
  expensesForView,
  getCategoryTotals,
  getLargestCategoryGrowth,
  getMonthHeadline,
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

interface DashboardViewProps {
  /** Navigate to Gastos filtered by this category (preserving month/view). */
  onOpenCategory: (category: string) => void;
  /** Navigate to Gastos with no filter applied. */
  onViewTransactions: () => void;
  onAddExpense: () => void;
  onAddGoal: () => void;
  onOpenAval: () => void;
}

export function DashboardView({
  onOpenCategory,
  onViewTransactions,
  onAddExpense,
  onAddGoal,
  onOpenAval,
}: DashboardViewProps) {
  const { state, month, setActiveMonth, setActivePerson } = useFinance();
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

  // Nível 2 ("entendimento"): reuses numbers.topCategory (already computed by
  // calc()) and the same headline logic Aval's chat hero already shows — no
  // new financial rule, just surfaced here too so "o que está pesando mais" /
  // "o que merece atenção" don't require scrolling into the analytical charts.
  const expensesInView = expensesForView(month, view, state.people);
  const growth = getLargestCategoryGrowth(state, view);
  const headline = getMonthHeadline(numbers, expensesInView, growth, money);
  const topCategory = numbers.topCategory;

  return (
    <div className="flex flex-col gap-4">
      {/* Compact budget summary -- the full "Seu dinheiro" hero lives on Inicio, this stays lighter */}
      <section className="card-surface hero-texture relative flex items-center gap-4 overflow-hidden rounded-3xl p-5 pb-7">
        <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
        <BudgetRing percent={usedPct} overBudget={overBudget} size={64} />
        <div className="relative min-w-0">
          <span className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            {view === VIEW_ME
              ? "Renda do mês"
              : view === VIEW_SPOUSE
                ? "Repasse do mês"
                : "Orçamento do mês"}
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

      {/* Nível 2 ("entendimento"): biggest category + one-line "what needs
          attention" — same data calc()/getMonthHeadline already produce for
          the hero card and o Aval, surfaced here so it doesn't require
          scrolling past the analytical charts below to find out. */}
      <Panel tone="flat" className="relative z-10 -mt-3">
        <PanelHead title="Situação do mês" icon={TriangleAlert} />
        <div className="flex flex-col gap-3">
          {topCategory && (
            <button
              type="button"
              onClick={() => onOpenCategory(topCategory.category)}
              aria-label={`Ver gastos da categoria ${categoryLabel(topCategory.category)}`}
              className="press focus-ring hover-lift flex items-center justify-between gap-3 rounded-2xl bg-secondary/70 p-3.5 text-left transition-colors hover:bg-secondary"
            >
              <div className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Categoria que mais pesa
                </span>
                <strong className="block truncate text-sm font-bold text-foreground">
                  {categoryLabel(topCategory.category)}
                </strong>
              </div>
              <strong className="tnum shrink-0 font-display text-lg text-primary">
                {money(topCategory.total)}
              </strong>
            </button>
          )}
          <p className="text-sm leading-relaxed text-foreground/85">{headline}</p>
        </div>
      </Panel>

      {/* P0-FRONTEND-1B.4: the one thing missing from the Painel was a clear
          "what do I do now" — these are shortcuts to flows that already
          exist elsewhere (Novo gasto, Gastos, nova meta, Aval), not new
          functionality. */}
      <Panel tone="flat" className="relative z-10">
        <PanelHead title="Ações rápidas" icon={Zap} />
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <QuickActionButton icon={Plus} label="Adicionar gasto" onClick={onAddExpense} />
          <QuickActionButton
            icon={ArrowLeftRight}
            label="Ver gastos"
            onClick={onViewTransactions}
          />
          <QuickActionButton icon={Target} label="Adicionar meta" onClick={onAddGoal} />
          <QuickActionButton icon={Sparkles} label="Perguntar ao Aval" onClick={onOpenAval} />
        </div>
      </Panel>

      {/* Month history timeline -- pulled up to overlap the hero card for a layered feel */}
      <Panel className="relative z-10">
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

      {/* Nível 3 ("análise"): grouped under one label so these read as
          supporting detail, not five cards competing with the summary above. */}
      <span className="mt-1 px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Análise detalhada
      </span>

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
              <button
                key={key}
                type="button"
                onClick={() => {
                  // Already-selected person: no write, keep the visual state as-is.
                  if (key !== view) setActivePerson(key);
                }}
                aria-pressed={active}
                aria-label={`Ver gastos de ${name}`}
                className={`press focus-ring w-full rounded-2xl border p-3.5 text-left transition-colors ${active ? "border-primary bg-primary-soft" : "border-border bg-secondary hover:border-primary/25"}`}
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
              </button>
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

function QuickActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press focus-ring hover-lift flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-secondary p-3 text-center"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
      </span>
      <span className="text-[11px] font-bold leading-tight text-foreground">{label}</span>
    </button>
  );
}
