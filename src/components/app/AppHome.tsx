import { useState } from "react";
import { Plus, CalendarPlus } from "lucide-react";

import { formatMonthLabel, viewLabel } from "@/lib/finance/calc";
import { VIEW_ME, VIEW_SPOUSE } from "@/lib/finance/constants";
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
  dashboard: "Painel",
  transactions: "Gastos",
  priorities: "Prioridades",
  assistant: "Assistente IA",
  settings: "Configurações",
};

export function AppHome() {
  const { activeUser, state, month, setActivePerson, setActiveMonth, createNextMonth } = useFinance();
  const [view, setView] = useState<ViewKey>("dashboard");
  const [expenseDialog, setExpenseDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [priorityDialog, setPriorityDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [monthOpen, setMonthOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);

  return (
    <div className="app-backdrop min-h-dvh">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-background/60">
        {/* Header */}
        <header className="sticky top-0 z-20 bg-background/85 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{titles[view]}</p>
              <h1 className="truncate font-display text-xl font-bold text-foreground">
                Olá, {activeUser?.name || "controle sua casa"}
              </h1>
            </div>
            <div className="hero-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-display text-sm font-bold text-primary-foreground shadow-primary">
              AF
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <select
              value={state.activeMonth}
              onChange={(e) => setActiveMonth(e.target.value)}
              className="h-10 flex-1 rounded-xl border border-input bg-card px-3 text-sm font-semibold text-foreground outline-none focus:border-primary"
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
              className="flex h-10 items-center gap-1.5 rounded-xl bg-primary-soft px-3 text-sm font-semibold text-primary"
              title={`Criar ${formatMonthLabel(state.activeMonth)}`}
            >
              <CalendarPlus className="h-4 w-4" /> Mês
            </button>
          </div>

          <Segmented
            className="mt-2.5"
            value={state.activePerson === VIEW_SPOUSE ? VIEW_SPOUSE : VIEW_ME}
            onChange={(v) => setActivePerson(v)}
            options={[
              { value: VIEW_ME, label: viewLabel(VIEW_ME) },
              { value: VIEW_SPOUSE, label: viewLabel(VIEW_SPOUSE) },
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
          {view === "assistant" && <AssistantView />}
          {view === "settings" && <SettingsView onEditPeople={() => setPeopleOpen(true)} onEditMonth={() => setMonthOpen(true)} />}
        </main>

        {/* FAB — add expense */}
        {(view === "dashboard" || view === "transactions") && (
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
