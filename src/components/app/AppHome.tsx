import { useRef, useState, type ReactNode } from "react";
import { Plus, CalendarPlus, ChevronDown, Download, LogOut, Settings, Upload, UserRound } from "lucide-react";

import { formatMonthLabel } from "@/lib/finance/calc";
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
  const { activeUser, state, setActivePerson, setActiveMonth, createNextMonth, exportData, importData, logout } = useFinance();
  const [view, setView] = useState<ViewKey>("assistant");
  const [expenseDialog, setExpenseDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [priorityDialog, setPriorityDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [monthOpen, setMonthOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const initials = getInitials(activeUser?.name || "Assistente Financeiro");

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importData(file);
      setProfileMenuOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Nao consegui importar esse arquivo.");
    } finally {
      e.target.value = "";
    }
  }

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
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((value) => !value)}
                className="hero-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.25rem] font-display text-sm font-bold text-primary-foreground shadow-primary transition active:scale-95"
                aria-label="Abrir opcoes do perfil"
              >
                {initials}
              </button>
              {profileMenuOpen ? (
                <div className="absolute right-0 top-12 z-40 w-[260px] rounded-[1.5rem] border border-border bg-card/96 p-3 text-left shadow-float backdrop-blur-xl">
                  <div className="mb-3 flex items-center gap-3 rounded-2xl bg-secondary p-3">
                    <div className="hero-gradient flex h-10 w-10 items-center justify-center rounded-2xl font-display text-sm font-bold text-primary-foreground">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <strong className="block truncate text-sm font-bold text-foreground">{activeUser?.name || "Perfil"}</strong>
                      <span className="text-xs text-muted-foreground">Conta local neste aparelho</span>
                    </div>
                  </div>
                  <input ref={importRef} type="file" accept=".json,.xls,.xlsx,application/json" className="hidden" onChange={onImport} />
                  <HeaderMenuButton icon={<Settings className="h-4 w-4" />} label="Configuracoes" onClick={() => { setView("settings"); setProfileMenuOpen(false); }} />
                  <HeaderMenuButton icon={<UserRound className="h-4 w-4" />} label="Perfis financeiros" onClick={() => { setPeopleOpen(true); setProfileMenuOpen(false); }} />
                  <HeaderMenuButton icon={<CalendarPlus className="h-4 w-4" />} label="Editar mes" onClick={() => { setMonthOpen(true); setProfileMenuOpen(false); }} />
                  <HeaderMenuButton icon={<Download className="h-4 w-4" />} label="Exportar backup" onClick={() => { exportData(); setProfileMenuOpen(false); }} />
                  <HeaderMenuButton icon={<Upload className="h-4 w-4" />} label="Importar dados" onClick={() => importRef.current?.click()} />
                  <HeaderMenuButton icon={<LogOut className="h-4 w-4" />} label="Sair do perfil" danger onClick={() => { logout(); setProfileMenuOpen(false); }} />
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="relative flex-1">
              <select
                value={state.activeMonth}
                onChange={(e) => setActiveMonth(e.target.value)}
                className="h-11 w-full appearance-none rounded-[1.35rem] border border-white/70 bg-card/92 px-4 pr-10 text-sm font-bold text-foreground shadow-soft outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                {Object.entries(state.months)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([key, data]) => (
                    <option key={key} value={key}>
                      {data.label}
                    </option>
                  ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            <button
              type="button"
              onClick={() => createNextMonth()}
              className="flex h-11 items-center gap-1.5 rounded-[1.35rem] bg-primary-soft px-3 text-sm font-bold text-primary shadow-soft transition active:scale-[0.98]"
              title={`Criar ${formatMonthLabel(state.activeMonth)}`}
            >
              <CalendarPlus className="h-4 w-4" /> Mês
            </button>
          </div>

          {view !== "settings" ? (
            <Segmented
              className="mt-2.5"
              value={state.activePerson}
              onChange={(v) => setActivePerson(v)}
              options={[
                ...state.people.map((person, index) => ({
                  value: index === 0 ? VIEW_ME : index === 1 ? VIEW_SPOUSE : person,
                  label: person,
                })),
                { value: VIEW_ALL, label: "Tudo junto" },
              ]}
            />
          ) : null}
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
            className="fixed bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+6rem))] right-[max(1.25rem,calc(50%-220px+1.25rem))] z-30 flex h-14 w-14 items-center justify-center rounded-full border border-white/55 bg-primary/72 text-primary-foreground shadow-float backdrop-blur-xl transition active:scale-95"
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "A";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1];
  return `${first || ""}${second || ""}`.toLocaleUpperCase("pt-BR").slice(0, 2);
}

function HeaderMenuButton({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-bold transition active:scale-[0.99] ${
        danger ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-secondary"
      }`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${danger ? "bg-destructive/10" : "bg-primary-soft text-primary"}`}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
