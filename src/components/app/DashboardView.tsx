import { useState } from "react";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  BarChart3,
  Calculator,
  CalendarClock,
  CalendarRange,
  ChevronDown,
  History,
  PieChart,
  Plus,
  Receipt,
  Target,
  TrendingUp,
  TriangleAlert,
  Users,
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
import { AvalMark, ListItemCard, Panel, PanelHead, StatusPill } from "./ui";

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
  /** Aval Modern (P9.5) — opens the existing PurchaseSimulatorDialog (already used from AssistantView); a new entry point to an existing flow, not a new feature. */
  onOpenSimulator: () => void;
}

export function DashboardView({
  onOpenCategory,
  onViewTransactions,
  onAddExpense,
  onAddGoal,
  onOpenAval,
  onEditExpense,
  onEditPeople,
  onOpenSimulator,
}: DashboardViewProps) {
  const { state, month, setActiveMonth, setActivePerson } = useFinance();
  const money = useMoney();
  // P9.4 — "Análise detalhada" collapses on mobile (Fase-1 plan: reduce the
  // always-rendered panel count below the fold) and stays always-visible on
  // desktop via the lg: override in the className below, not this state —
  // the analytical panels themselves are never unmounted, only hidden via
  // CSS, so nothing here changes what data is computed or available.
  const [analysisOpen, setAnalysisOpen] = useState(false);
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
      {/* Aval Modern (P9.5) — the hero surface moves from the flat
          card-surface to finance-hero: a radial gold-tinted gradient with a
          thin champagne edge, the one deliberately distinctive surface in
          the Home (every other block stays flat/borderless below). "Livre"
          is the loudest figure on the screen — text-hero was bumped for
          stronger contrast — and the four secondary figures sit in one
          integrated 2x2 grid instead of two separate rows. The progress
          fill uses the gold accent (a completion indicator, not a financial
          signal) — the only place color communicates state is still "Livre"
          itself via overBudget. Every value/percentage is unchanged from
          calc()/budgetForView(), zero-guarded exactly as before. */}
      <section className="finance-hero hero-texture relative overflow-hidden rounded-3xl p-6">
        <div className="relative">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Seu mês
          </span>
          <span className="mt-3 block text-xs font-semibold uppercase tracking-[0.08em] text-primary/80">
            Livre
          </span>
          <strong
            className={`tnum mt-1 block font-display text-hero leading-none ${
              overBudget ? "text-destructive" : "text-success"
            }`}
          >
            {money(numbers.free)}
          </strong>

          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
            <HeroStat
              label={view === VIEW_ME ? "Renda" : view === VIEW_SPOUSE ? "Repasse" : "Disponível"}
              value={money(budget)}
            />
            <HeroStat label="Comprometido" value={money(numbers.total)} />
            <HeroStat label="Pago" value={money(numbers.paid)} />
            <HeroStat label="Falta pagar" value={money(numbers.pending)} />
          </div>

          <div
            role="progressbar"
            aria-label="Proporção já paga no mês"
            aria-valuenow={Math.round(paidPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/10"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${paidPct}%` }}
            />
          </div>
        </div>
      </section>

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
      {/* Aval Modern (P9.5) — "Divisão da casa" and "Próximos meses" (who vs.
          when) no longer sit as two separate cards with a gap between them:
          when both apply they share one continuous grouped surface (the
          wrapper clips to one rounded outline, a 1px hairline is the only
          separator — no second card boundary). Each keeps its own <section>
          (Panel) underneath, so every existing test/helper scoped to either
          heading via .closest("section") still resolves to that panel alone
          — only the OUTER visual grouping changed, not the DOM depth either
          block's own content sits at. */}
      {view === VIEW_ALL && state.people.length >= 2 ? (
        <div className="overflow-hidden rounded-3xl">
          <Panel tone="flat" className="rounded-none">
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
                    className="press focus-ring hover-lift w-full rounded-2xl bg-secondary/60 p-3.5 text-left transition-colors hover:bg-secondary"
                  >
                    <strong className="block truncate text-sm font-bold text-foreground">
                      {name}
                    </strong>
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <HeroStat label="Disponível" value={money(profileBudget)} />
                      <HeroStat label="Comprometido" value={money(profileNumbers.total)} />
                      <div className="min-w-0">
                        <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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

          <div className="h-px bg-border/30" />

          <Panel tone="flat" className="rounded-none">
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
        </div>
      ) : (
        /* P9.3 — "Próximos meses": compares "livre" (calc().free) for the
            selected month against the next two, for whichever view is active
            (household or a specific profile) — same scope the rest of the
            Home already uses. Compact by design: only "livre" + a delta vs.
            the selected month, not a repeat of every hero metric per month. */
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
      )}

      {/* P0-DASHBOARD-REFINE: at >=lg, Situação do mês + Ações rápidas stack in
          a left column next to Movimentações recentes on the right — same DOM
          order as mobile (grid only changes visual position, not the reading
          order), so nothing needs a separate desktop layout or new breakpoint. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4">
          {/* Aval Modern (P9.5) — "Situação do mês" and "Ações rápidas" merge
              into a single surface (they were always the same left column,
              context + what-to-do-next, split into two boxes only by
              accident of phasing). Separated by spacing + its own PanelHead
              label, not a border-t divider — one less independently-boxed
              panel on the Home without losing either heading (still its own
              <h2>) or any of the 4 actions. */}
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
                    <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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

            {/* Aval Modern (P9.5) — actions read as real app actions (pill
                buttons), not informational mini-cards: one primary (gold,
                full-width) plus a scrollable row of secondary pills. Same 4
                flows as before (Novo gasto, Gastos, nova meta, Aval) plus
                one new entry point — "Simular compra" already exists as a
                dialog (used from o Aval); this just wires the same
                onOpenSimulator handler AssistantView already uses, not new
                functionality. */}
            <div className="relative z-10 mt-5">
              <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Ações rápidas
              </h2>
              <PrimaryActionPill icon={Plus} label="Adicionar gasto" onClick={onAddExpense} />
              <div className="mt-2.5 flex gap-2 overflow-x-auto no-scrollbar">
                <SecondaryActionPill
                  icon={ArrowLeftRight}
                  label="Ver gastos"
                  onClick={onViewTransactions}
                />
                <SecondaryActionPill
                  icon={Calculator}
                  label="Simular compra"
                  onClick={onOpenSimulator}
                />
                <SecondaryActionPill icon={Target} label="Adicionar meta" onClick={onAddGoal} />
                {/* P0-FRONTEND-1B.7: the Aval brand mark, not a generic AI
                    icon — icon={null} tells SecondaryActionPill to render
                    AvalMark instead. */}
                <SecondaryActionPill icon={null} label="Perguntar ao Aval" onClick={onOpenAval} />
              </div>
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
            <div className="flex flex-col divide-y divide-border/15">
              {recentExpenses.map((item) => {
                const Icon = categoryIcons[item.category] || categoryIcons.Outros;
                const color = categoryColors[item.category] || "var(--color-primary)";
                return (
                  <ListItemCard
                    key={item.id}
                    onClick={() => onEditExpense(item.id)}
                    ariaLabel={`Editar gasto ${item.name}`}
                    icon={
                      <span style={{ color }}>
                        <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                      </span>
                    }
                    title={item.name}
                    value={money(item.amount)}
                    meta={
                      <>
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
                      </>
                    }
                    trailing={<StatusPill status={item.status} />}
                  />
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
                className={`press focus-ring hover-lift flex min-w-[130px] flex-col gap-0.5 rounded-2xl p-3 text-left ${
                  active ? "bg-primary-soft" : "bg-secondary/60 hover:bg-secondary"
                }`}
              >
                <span className="text-xs font-medium text-muted-foreground">{data.label}</span>
                <strong className="tnum text-base font-bold text-foreground">{money(total)}</strong>
                <small className="text-xs text-muted-foreground">
                  {data.planned ? "Planejado" : `${money(pending)} pendente`}
                </small>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* Nível 3 ("análise"): grouped under one label so these read as
          supporting detail, not five cards competing with the summary above.
          P9.4 — on mobile this collapses behind the toggle below (Fase-1
          plan: "Análise detalhada" passa de sempre-visível para bloco
          secundário); on desktop (lg:) it stays always-visible regardless of
          analysisOpen, matching the same panels that already exist today —
          nothing new is computed, only reordered/regrouped. */}
      <button
        type="button"
        onClick={() => setAnalysisOpen((value) => !value)}
        aria-expanded={analysisOpen}
        aria-controls="analise-detalhada"
        className="press focus-ring mt-1 flex items-center gap-1.5 self-start rounded-full px-1 py-1.5 text-left lg:pointer-events-none lg:cursor-default"
      >
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Análise detalhada
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 lg:hidden ${
            analysisOpen ? "rotate-180" : ""
          }`}
          strokeWidth={2.4}
        />
      </button>

      <div
        id="analise-detalhada"
        className={`flex-col gap-4 lg:flex ${analysisOpen ? "flex" : "hidden"}`}
      >
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
                  className={`press focus-ring w-full rounded-2xl p-3.5 text-left transition-colors ${active ? "bg-primary-soft" : "bg-secondary/60 hover:bg-secondary"}`}
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
                  <small className="mt-1 block text-xs text-muted-foreground">
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
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
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
      className={`press focus-ring hover-lift flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl p-3 text-center transition-colors ${
        isSelected ? "bg-primary-soft" : "bg-secondary/60 hover:bg-secondary"
      }`}
    >
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
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
      <span className="text-2xs text-muted-foreground">livre</span>
      {direction && direction !== "flat" && (
        <span
          className={`flex items-center gap-0.5 text-xs font-semibold ${
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
        <span className="text-xs font-semibold text-muted-foreground">Estável</span>
      )}
    </button>
  );
}

/** One structural stat in the hero (Disponível/Comprometido/Renda/Repasse) — same size/weight for all, deliberately quieter than "Livre". */
function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <strong className="tnum block font-display text-lg leading-none text-foreground">
        {value}
      </strong>
    </div>
  );
}

/** The one primary action on the Home — solid gold pill, full width. */
function PrimaryActionPill({
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
      className="press focus-ring hover-lift flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-primary"
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={2.4} />
      {label}
    </button>
  );
}

/** Secondary actions — smaller translucent pills in a scrollable row, never a mini-card. */
function SecondaryActionPill({
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
      className="glass-surface press glass-pressed focus-ring hover-lift flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-xs font-bold text-foreground"
    >
      {Icon ? <Icon className="h-[15px] w-[15px]" strokeWidth={2.2} /> : <AvalMark size={14} />}
      {label}
    </button>
  );
}
