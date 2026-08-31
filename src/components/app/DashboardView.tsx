import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  BarChart3,
  CalendarClock,
  CalendarRange,
  History,
  PieChart,
  Plus,
  Receipt,
  Target,
  TrendingUp,
  TriangleAlert,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

import { useFinance, useMoney } from "@/lib/finance/FinanceContext";
import type { MonthData } from "@/lib/finance/types";
import {
  calc,
  budgetForView,
  categoryLabel,
  chartMonthEntries,
  expensesForView,
  formatDate,
  getCategoryTotals,
  getLargestCategoryGrowth,
  getMonthHeadline,
  getNextMonthKey,
  ownerLabelForPeople,
  sum,
  timelineMonthEntries,
  viewLabelForPeople,
} from "@/lib/finance/calc";
import {
  categoryColors,
  categoryIcons,
  VIEW_ALL,
  VIEW_ME,
  VIEW_SPOUSE,
} from "@/lib/finance/constants";

import { DonutChart } from "./charts/DonutChart";
import { CategoryBars } from "./charts/CategoryBars";
import { MonthlyBars } from "./charts/MonthlyBars";
import { TrendChart } from "./charts/TrendChart";
import { AvalMark, BudgetRing, Panel, PanelHead, StatusPill } from "./ui";

/** Mirrors TransactionsView's own sort — same recency ordering as Gastos, not a new rule. */
const RECENT_LIMIT = 5;

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
  /** Opens the existing ExpenseDialog in edit mode — same flow Gastos uses, not a second dialog. */
  onEditExpense: (id: string) => void;
  /** Opens the existing PeopleDialog ("Perfis financeiros") — no new dialog, no new persistence. */
  onEditPeople: () => void;
}

export function DashboardView({
  onOpenCategory,
  onViewTransactions,
  onAddExpense,
  onAddGoal,
  onOpenAval,
  onEditExpense,
  onEditPeople,
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

  // Nível 3 ("atividade recente"): same rows Gastos would show for this
  // month/view, just the most recent RECENT_LIMIT — same sort Gastos uses
  // (date desc), same filtered array, zero new calculation or persistence.
  const recentExpenses = [...expensesInView]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, RECENT_LIMIT);

  const paidPendingTotal = numbers.paid + numbers.pending;
  const paidPct =
    paidPendingTotal > 0 ? Math.min(100, Math.max(0, (numbers.paid / paidPendingTotal) * 100)) : 0;

  // P9.3 — "Próximos meses": selected month + the next two, via real
  // Date-based rollover (getNextMonthKey — the same function createNextMonth's
  // "+ Mês" flow already trusts; no string concatenation, no 30-day
  // assumptions, correct across Dec->Jan and leap years for free). Reuses
  // calc() for each key, once per month, exactly like the hero/Divisão da
  // casa do for people — no parallel financial rule. A month with no
  // MonthData yet is never faked into a zeroed forecast: `exists` stays
  // false and the render below shows a neutral placeholder instead.
  const upcomingMonthKeys = [
    state.activeMonth,
    getNextMonthKey(state.activeMonth),
    getNextMonthKey(getNextMonthKey(state.activeMonth)),
  ];
  const upcomingMonths = upcomingMonthKeys.map((key) => {
    const data: MonthData | undefined = state.months[key];
    if (!data) return { key, exists: false as const };
    return { key, exists: true as const, free: calc(data, view, key, state.people).free };
  });
  const selectedMonthEntry = upcomingMonths[0];

  return (
    <div className="flex flex-col gap-4">
      {/* P9.1 — the financial hero: Disponível/Comprometido are structural
          context (same size/weight), Livre is the loudest number on the
          screen (colored by the same overBudget flag the ring already used).
          All three come straight from calc()/budgetForView() — no new rule. */}
      <section className="card-surface hero-texture relative overflow-hidden rounded-3xl p-5">
        <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <BudgetRing percent={usedPct} overBudget={overBudget} size={64} />
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              Seu mês
            </span>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <HeroStat
                label={view === VIEW_ME ? "Renda" : view === VIEW_SPOUSE ? "Repasse" : "Disponível"}
                value={money(budget)}
              />
              <HeroStat label="Comprometido" value={money(numbers.total)} />
            </div>
          </div>
        </div>
        <div className="relative mt-4 border-t border-border/50 pt-3.5">
          <span className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            Livre
          </span>
          <strong
            className={`tnum mt-0.5 block font-display text-[2.1rem] leading-none ${
              overBudget ? "text-destructive" : "text-success"
            }`}
          >
            {money(numbers.free)}
          </strong>
        </div>
      </section>

      {/* P9.1 — Pago vs. falta pagar, straight from calc().paid/pending; the
          bar is paid/(paid+pending), guarded against 0/0 (renders an empty,
          neutral track instead of dividing by zero). */}
      <Panel tone="flat">
        <PanelHead title="Progresso do mês" icon={Wallet} />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Pago
            </span>
            <strong className="tnum block font-display text-lg leading-none text-foreground">
              {money(numbers.paid)}
            </strong>
          </div>
          <div className="min-w-0 text-right">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Falta pagar
            </span>
            <strong className="tnum block font-display text-lg leading-none text-foreground">
              {money(numbers.pending)}
            </strong>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label="Proporção já paga no mês"
          aria-valuenow={Math.round(paidPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary"
        >
          <div
            className="h-full rounded-full bg-success transition-[width]"
            style={{ width: `${paidPct}%` }}
          />
        </div>
      </Panel>

      {/* P9.2 — "Divisão da casa": one card per active profile, each reading
          calc()/budgetForView() for that profile's own view (same index0 ->
          VIEW_ME / index1 -> VIEW_SPOUSE / index>=2 -> literal name convention
          "Divisão familiar" already uses below) — no new financial rule, just
          the same functions called once per profile instead of once for the
          active view. Only in VIEW_ALL (the hero above already represents a
          single profile's own numbers once you're inside its view) and only
          with 2+ profiles (with exactly one profile it would just repeat the
          hero). Stacked full-width cards, not a grid, so "Livre" stays
          comparable at a glance regardless of how many profiles exist. */}
      {view === VIEW_ALL && state.people.length >= 2 && (
        <Panel tone="flat">
          <PanelHead
            title="Divisão da casa"
            icon={Users}
            action={
              <button
                type="button"
                onClick={onEditPeople}
                className="press focus-ring shrink-0 text-xs font-bold text-primary"
              >
                Editar nomes
              </button>
            }
          />
          <div className="flex flex-col gap-3">
            {state.people.map((name, index) => {
              const profileView = index === 0 ? VIEW_ME : index === 1 ? VIEW_SPOUSE : name;
              const profileNumbers = calc(month, profileView, state.activeMonth, state.people);
              const profileBudget = budgetForView(month, profileView);
              const profileOverBudget = profileNumbers.free < 0;
              return (
                <button
                  key={`${profileView}-${index}`}
                  type="button"
                  onClick={() => setActivePerson(profileView)}
                  aria-label={`Ver detalhes financeiros de ${name}`}
                  className="press focus-ring hover-lift w-full rounded-2xl border border-border bg-secondary/70 p-3.5 text-left transition-colors hover:bg-secondary"
                >
                  <strong className="block truncate text-sm font-bold text-foreground">
                    {name}
                  </strong>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <HeroStat label="Disponível" value={money(profileBudget)} />
                    <HeroStat label="Comprometido" value={money(profileNumbers.total)} />
                    <div className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Livre
                      </span>
                      <strong
                        className={`tnum block font-display text-lg leading-none ${
                          profileOverBudget ? "text-destructive" : "text-success"
                        }`}
                      >
                        {money(profileNumbers.free)}
                      </strong>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>
      )}

      {/* P9.3 — "Próximos meses": compares "livre" (calc().free) for the
          selected month against the next two, for whichever view is active
          (household or a specific profile) — same scope the rest of the
          Home already uses. Compact by design: only "livre" + a delta vs.
          the selected month, not a repeat of every hero metric per month. */}
      <Panel tone="flat">
        <PanelHead title="Próximos meses" icon={CalendarClock} />
        <div className="flex gap-2">
          {upcomingMonths.map((entry, index) => (
            <MonthCompareCard
              key={entry.key}
              entry={entry}
              isSelected={index === 0}
              referenceFree={selectedMonthEntry.exists ? selectedMonthEntry.free : null}
              formatMoney={money}
              onSelect={setActiveMonth}
            />
          ))}
        </div>
      </Panel>

      {/* P0-DASHBOARD-REFINE: at >=lg, Situação do mês + Ações rápidas stack in
          a left column next to Movimentações recentes on the right — same DOM
          order as mobile (grid only changes visual position, not the reading
          order), so nothing needs a separate desktop layout or new breakpoint. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4">
          {/* Nível 2 ("entendimento"): biggest category + one-line "what needs
              attention" — same data calc()/getMonthHeadline already produce for
              the hero card and o Aval, surfaced here so it doesn't require
              scrolling past the analytical charts below to find out. */}
          <Panel tone="flat">
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
              {/* P0-FRONTEND-1B.7: the Aval brand mark, not a generic AI icon —
                  icon={null} tells QuickActionButton to render AvalMark instead. */}
              <QuickActionButton icon={null} label="Perguntar ao Aval" onClick={onOpenAval} />
            </div>
          </Panel>
        </div>

        {/* Nível 3 ("atividade recente"): the same rows Gastos shows for this
            month/view, most recent first — solid cards (no glass), status pill
            reused as-is from ui.tsx, edit reuses the existing ExpenseDialog. */}
        <Panel tone="flat">
          <PanelHead
            title="Movimentações recentes"
            action={
              <button
                type="button"
                onClick={onViewTransactions}
                className="press focus-ring shrink-0 text-xs font-bold text-primary"
              >
                Ver todas
              </button>
            }
          />
          {recentExpenses.length === 0 ? (
            <div className="flex flex-col items-center px-2 py-6 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft">
                <Receipt className="h-5 w-5 text-primary" strokeWidth={2} />
              </div>
              <p className="mt-3 text-sm font-bold text-foreground">
                Nenhuma movimentação neste mês
              </p>
              <button
                type="button"
                onClick={onAddExpense}
                className="press focus-ring mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-primary"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} /> Adicionar gasto
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {recentExpenses.map((item) => {
                const Icon = categoryIcons[item.category] || categoryIcons.Outros;
                const color = categoryColors[item.category] || "var(--color-primary)";
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onEditExpense(item.id)}
                    aria-label={`Editar gasto ${item.name}`}
                    className="press focus-ring hover-lift flex items-center gap-3 rounded-2xl bg-secondary/70 p-3 text-left transition-colors hover:bg-secondary"
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card"
                      style={{ color }}
                    >
                      <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <strong className="min-w-0 truncate text-sm font-bold text-foreground">
                          {item.name}
                        </strong>
                        <strong className="tnum shrink-0 text-sm font-bold text-foreground">
                          {money(item.amount)}
                        </strong>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span className="truncate">{item.category}</span>
                        <span>·</span>
                        <span>{formatDate(item.date)}</span>
                        {state.people.length > 1 && (
                          <>
                            <span>·</span>
                            <span className="truncate">
                              {ownerLabelForPeople(item.owner, state.people)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <StatusPill status={item.status} />
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

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

/** "JAN"/"FEV"/"DEZ" — same real-Date construction as calc.ts's own formatMonthLabel/getNextMonthKey (never string slicing), so rollover/leap-year correctness comes from the same trusted source. */
function shortMonthLabel(key: string): string {
  const [year, monthNumber] = key.split("-").map(Number);
  const date = new Date(year, monthNumber - 1, 1);
  return date
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", "")
    .toLocaleUpperCase("pt-BR");
}

interface UpcomingMonthEntry {
  key: string;
  exists: boolean;
  free?: number;
}

/**
 * One "Próximos meses" cell. A month that isn't in state.months yet (no
 * MonthData) never gets a fabricated R$ 0,00 — `entry.exists` stays false and
 * this renders a neutral, non-interactive placeholder instead (P9.3: "não
 * inventar dados", "não persistir um mês apenas por visualizar"). A real
 * month is a genuine button reusing the existing setActiveMonth — no second
 * month-selection mechanism.
 */
function MonthCompareCard({
  entry,
  isSelected,
  referenceFree,
  formatMoney,
  onSelect,
}: {
  entry: UpcomingMonthEntry;
  isSelected: boolean;
  referenceFree: number | null;
  formatMoney: (value: number) => string;
  onSelect: (key: string) => void;
}) {
  const shortLabel = shortMonthLabel(entry.key);

  if (!entry.exists) {
    return (
      <div
        className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl border border-dashed border-border bg-secondary/40 p-3 text-center"
        aria-label={`${shortLabel} — sem dados ainda`}
      >
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {shortLabel}
        </span>
        <span className="text-xs text-muted-foreground">Sem dados</span>
      </div>
    );
  }

  const free = entry.free as number;
  const overBudget = free < 0;
  // Sign is determined first (up/down/flat); the magnitude shown is only
  // ever the absolute value, applied after the sign already decided the
  // direction — never the other way around.
  const delta = !isSelected && referenceFree !== null ? free - referenceFree : null;
  const direction: "up" | "down" | "flat" | null =
    delta === null ? null : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const deltaMagnitude = delta === null ? null : formatMoney(Math.abs(delta));
  const accessibleDelta =
    direction === null || direction === "flat"
      ? direction === "flat"
        ? ", mesmo valor livre que o mês selecionado"
        : ""
      : `, ${deltaMagnitude} ${direction === "up" ? "a mais" : "a menos"} livre que o mês selecionado`;

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.key)}
      aria-label={`Ver ${shortLabel}, livre ${formatMoney(free)}${accessibleDelta}`}
      className={`press focus-ring hover-lift flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl border p-3 text-center transition-colors ${
        isSelected
          ? "border-primary bg-primary-soft"
          : "border-border bg-secondary hover:border-primary/25"
      }`}
    >
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {shortLabel}
        {isSelected && <span className="text-primary"> · Atual</span>}
      </span>
      <strong
        className={`tnum font-display text-base leading-none ${
          overBudget ? "text-destructive" : "text-success"
        }`}
      >
        {formatMoney(free)}
      </strong>
      <span className="text-[10px] text-muted-foreground">livre</span>
      {direction && direction !== "flat" && (
        <span
          className={`flex items-center gap-0.5 text-[11px] font-semibold ${
            direction === "up" ? "text-success" : "text-destructive"
          }`}
        >
          {direction === "up" ? (
            <ArrowUp className="h-3 w-3" strokeWidth={2.5} />
          ) : (
            <ArrowDown className="h-3 w-3" strokeWidth={2.5} />
          )}
          {deltaMagnitude}
        </span>
      )}
      {direction === "flat" && (
        <span className="text-[11px] font-semibold text-muted-foreground">Estável</span>
      )}
    </button>
  );
}

/** One structural stat in the hero (Disponível/Comprometido/Renda/Repasse) — same size/weight for all, deliberately quieter than "Livre". */
function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <strong className="tnum block font-display text-lg leading-none text-foreground">
        {value}
      </strong>
    </div>
  );
}

function QuickActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  /** null renders the Aval brand mark instead of a lucide icon. */
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }> | null;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-surface press glass-pressed focus-ring hover-lift flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl p-3 text-center"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
        {Icon ? <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} /> : <AvalMark size={18} />}
      </span>
      <span className="text-[11px] font-bold leading-tight text-foreground">{label}</span>
    </button>
  );
}
