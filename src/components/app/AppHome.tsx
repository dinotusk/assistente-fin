import { useState } from "react";
import { Plus, CalendarPlus } from "lucide-react";

import { formatMonthLabel, viewLabelForPeople } from "@/lib/finance/calc";
import { VIEW_ALL, VIEW_ME, VIEW_SPOUSE } from "@/lib/finance/constants";
import { useFinance } from "@/lib/finance/FinanceContext";
import type { ViewKey } from "@/lib/finance/types";

import { AssistantView } from "./AssistantView";
import { BottomNav } from "./BottomNav";
import { DashboardView } from "./DashboardView";
import { PrioritiesView } from "./PrioritiesView";
import { SettingsView } from "./SettingsView";
import { TransactionsView } from "./TransactionsView";
import { ExpenseDialog, MonthDialog, PeopleDialog, PriorityDialog } from "./dialogs";
import { Segmented } from "./ui";

const titles: Record<ViewKey, string> = {
  assistant: "Início inteligente",
  dashboard: "Painel",
  transactions: "Gastos",
  priorities: "Prioridades",
  settings: "Configurações",
};

export function AppHome() {
  const { activeUser, state, month, setActivePerson, setActiveMonth, createNextMonth } = useFinance();
  const [view, setView] = useState<ViewKey>("assistant");
  const [expenseDialog, setExpenseDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [priorityDialog, setPriorityDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [monthOpen, setMonthOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);

  return (
    <div className="app-backdrop min-h-dvh">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-background/60">
        {/* Header */}
        <header className="sticky top-0 z-20 border-b border-white/60 bg-background/75 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-[0_10px_30px_rgba(15,83,66,0.04)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary/70">{titles[view]}</p>
              <h1 className="truncate font-display text-lg font-bold text-foreground">
                {activeUser?.name || "Assistente financeiro"}
              </h1>
            </div>
            <div className="hero-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-[1.15rem] font-display text-sm font-bold text-primary-foreground shadow-primary">
              AF
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <select
              value={state.activeMonth}
              onChange={(e) => setActiveMonth(e.target.value)}
              className="h-10 flex-1 rounded-2xl border border-input bg-card/90 px-3 text-sm font-semibold text-foreground outline-none focus:border-primary"
            >
              {Object.entries(state.months)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, data]) => (
                  <option key={key} value={key}>
                    {data.label}
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={() => createNextMonth()}
              className="flex h-10 items-center gap-1.5 rounded-2xl bg-primary-soft px-3 text-sm font-bold text-primary"
              title={`Criar ${formatMonthLabel(state.activeMonth)}`}
            >
              <CalendarPlus className="h-4 w-4" /> Mês
            </button>
          </div>

          <Segmented
            className="mt-2.5"
            value={state.activePerson === VIEW_ALL ? VIEW_ALL : state.activePerson === VIEW_SPOUSE ? VIEW_SPOUSE : VIEW_ME}
            onChange={(v) => setActivePerson(v)}
            options={[
              { value: VIEW_ME, label: viewLabelForPeople(VIEW_ME, state.people) },
              { value: VIEW_SPOUSE, label: viewLabelForPeople(VIEW_SPOUSE, state.people) },
              { value: VIEW_ALL, label: "Tudo junto" },
            ]}
          />
        </header>

        {/* Content */}
        <main className="flex-1 px-4 pb-32 pt-2">
          {view === "dashboard" && <DashboardView />}
          {view === "transactions" && <TransactionsView onEdit={(id) => setExpenseDialog({ open: true, id })} />}
          {view === "priorities" && (
            <PrioritiesView
              onEdit={(id) => setPriorityDialog({ open: true, id })}
              onAdd={() => setPriorityDialog({ open: true, id: null })}
            />
          )}
          {view === "assistant" && <AssistantView onAddExpense={() => setExpenseDialog({ open: true, id: null })} />}
          {view === "settings" && <SettingsView onEditPeople={() => setPeopleOpen(true)} onEditMonth={() => setMonthOpen(true)} />}
        </main>

        {/* FAB — add expense */}
        {(view === "assistant" || view === "dashboard" || view === "transactions") && (
          <button
            type="button"
            onClick={() => setExpenseDialog({ open: true, id: null })}
            className="hero-gradient fixed bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+6rem))] right-[max(1.25rem,calc(50%-220px+1.25rem))] z-30 flex h-14 w-14 items-center justify-center rounded-full text-primary-foreground shadow-float transition active:scale-95"
            aria-label="Adicionar gasto"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </button>
        )}

        <BottomNav view={view} onChange={setView} />
      </div>

      <ExpenseDialog
        open={expenseDialog.open}
        editingId={expenseDialog.id}
        onOpenChange={(o) => setExpenseDialog((s) => ({ ...s, open: o }))}
      />
      <PriorityDialog
        open={priorityDialog.open}
        editingId={priorityDialog.id}
        onOpenChange={(o) => setPriorityDialog((s) => ({ ...s, open: o }))}
      />
      <MonthDialog open={monthOpen} onOpenChange={setMonthOpen} />
      <PeopleDialog open={peopleOpen} onOpenChange={setPeopleOpen} />
    </div>
  );
}
