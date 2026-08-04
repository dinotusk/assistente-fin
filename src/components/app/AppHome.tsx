import { useEffect, useRef, useState, type ReactNode } from "react";
import { Plus, CalendarPlus, ChevronDown, Download, Eye, EyeOff, LogOut, Settings, Upload, UserRound } from "lucide-react";

import { formatMonthLabel } from "@/lib/finance/calc";
import { VIEW_ALL, VIEW_ME, VIEW_SPOUSE } from "@/lib/finance/constants";
import { useFinance } from "@/lib/finance/FinanceContext";
import type { ViewKey } from "@/lib/finance/types";

import { AssistantView } from "./AssistantView";
import { BottomNav } from "./BottomNav";
import { SideNav } from "./SideNav";
import { DashboardView } from "./DashboardView";
import { PrioritiesView } from "./PrioritiesView";
import { SettingsView } from "./SettingsView";
import { TransactionsView } from "./TransactionsView";
import { BankImportDialog, CategoriesDialog, ExpenseDialog, MonthDialog, PeopleDialog, PriorityDialog } from "./dialogs";
import { Segmented } from "./ui";

const titles: Record<ViewKey, string> = {
  assistant: "Início inteligente",
  dashboard: "Painel",
  transactions: "Gastos",
  priorities: "Prioridades",
  settings: "Configurações",
};

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

export function AppHome() {
  const { activeUser, state, hideValues, toggleHideValues, setActivePerson, setActiveMonth, createNextMonth, exportData, importData, logout } = useFinance();
  const isDesktop = useIsDesktop();
  const [view, setView] = useState<ViewKey>("assistant");
  const [expenseDialog, setExpenseDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [priorityDialog, setPriorityDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [monthOpen, setMonthOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [bankImportOpen, setBankImportOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const initials = getInitials(activeUser?.name || "Aval");

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

  const showFab = view === "assistant" || view === "dashboard" || view === "transactions";
  const activeMonthLabel = state.months[state.activeMonth]?.label || formatMonthLabel(state.activeMonth);
  const firstName = activeUser?.name?.trim().split(/\s+/)[0] || "Você";

  const profileMenu = (
    <div className="rounded-[1.5rem] border border-border bg-card/96 p-3 text-left shadow-float backdrop-blur-xl">
      <div className="mb-3 flex items-center gap-3 rounded-2xl bg-secondary p-3">
        <div className="hero-gradient flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-bold text-primary-foreground">
          {initials}
        </div>
        <div className="min-w-0">
          <strong className="block truncate text-sm font-bold text-foreground">{activeUser?.name || "Perfil"}</strong>
          <span className="text-xs text-muted-foreground">Conta local neste aparelho</span>
        </div>
      </div>
      <HeaderMenuButton icon={<Settings className="h-4 w-4" />} label="Configuracoes" onClick={() => { setView("settings"); setProfileMenuOpen(false); }} />
      <HeaderMenuButton icon={<UserRound className="h-4 w-4" />} label="Perfis financeiros" onClick={() => { setPeopleOpen(true); setProfileMenuOpen(false); }} />
      <HeaderMenuButton icon={<CalendarPlus className="h-4 w-4" />} label="Editar mes" onClick={() => { setMonthOpen(true); setProfileMenuOpen(false); }} />
      <HeaderMenuButton icon={<Download className="h-4 w-4" />} label="Exportar backup" onClick={() => { exportData(); setProfileMenuOpen(false); }} />
      <HeaderMenuButton icon={<Upload className="h-4 w-4" />} label="Importar dados" onClick={() => importRef.current?.click()} />
      <HeaderMenuButton icon={<LogOut className="h-4 w-4" />} label="Sair do perfil" danger onClick={() => { logout(); setProfileMenuOpen(false); }} />
    </div>
  );

  const personSegmented = view !== "settings" ? (
    <Segmented
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
  ) : null;

  const monthPicker = (
    <>
      <div className="relative flex-1">
        <select
          value={state.activeMonth}
          onChange={(e) => setActiveMonth(e.target.value)}
          aria-label="Selecionar mês"
          className="focus-ring h-11 w-full appearance-none rounded-[1.35rem] border border-border bg-card px-4 pr-10 text-sm font-bold text-foreground shadow-soft outline-none transition focus:border-primary"
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
        className="press focus-ring flex h-11 items-center gap-1.5 rounded-[1.35rem] bg-primary-soft px-4 text-sm font-bold text-primary shadow-soft hover:bg-primary/15"
        title={`Criar ${formatMonthLabel(state.activeMonth)}`}
      >
        <CalendarPlus className="h-4 w-4" strokeWidth={2.25} /> Mês
      </button>
    </>
  );

  const content = (
    <div key={view} className="animate-view">
      {view === "dashboard" && <DashboardView />}
      {view === "transactions" && (
        <TransactionsView
          onEdit={(id) => setExpenseDialog({ open: true, id })}
          onAdd={() => setExpenseDialog({ open: true, id: null })}
        />
      )}
      {view === "priorities" && (
        <PrioritiesView
          onEdit={(id) => setPriorityDialog({ open: true, id })}
          onAdd={() => setPriorityDialog({ open: true, id: null })}
        />
      )}
      {view === "assistant" && <AssistantView onAddExpense={() => setExpenseDialog({ open: true, id: null })} />}
      {view === "settings" && (
        <SettingsView
          onEditPeople={() => setPeopleOpen(true)}
          onEditMonth={() => setMonthOpen(true)}
          onEditCategories={() => setCategoriesOpen(true)}
          onImportBank={() => setBankImportOpen(true)}
        />
      )}
    </div>
  );

  const hiddenImport = (
    <input ref={importRef} type="file" accept=".json,.xls,.xlsx,application/json" className="hidden" onChange={onImport} />
  );

  const dialogs = (
    <>
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
      <CategoriesDialog open={categoriesOpen} onOpenChange={setCategoriesOpen} />
      <BankImportDialog open={bankImportOpen} onOpenChange={setBankImportOpen} />
    </>
  );

  if (isDesktop) {
    return (
      <div className="app-backdrop flex min-h-dvh">
        {hiddenImport}
        <SideNav
          view={view}
          onChange={(v) => { setView(v); setProfileMenuOpen(false); }}
          footer={
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((value) => !value)}
                className="press focus-ring flex w-full items-center gap-3 rounded-2xl border border-border bg-secondary/60 px-3 py-2.5 text-left"
              >
                <div className="hero-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-primary-foreground">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm font-bold text-foreground">{activeUser?.name || "Perfil"}</strong>
                  <span className="block truncate text-xs text-muted-foreground">Conta local</span>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
              {profileMenuOpen ? (
                <div className="absolute bottom-14 left-0 z-40 w-full">{profileMenu}</div>
              ) : null}
            </div>
          }
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border/70 bg-background/70 px-8 py-4 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary/70">{titles[view]}</p>
                <h1 className="truncate font-display text-3xl text-foreground">
                  {activeUser?.name || "Aval"}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <HideValuesToggle hidden={hideValues} onClick={toggleHideValues} />
                {monthPicker}
              </div>
              {showFab && (
                <button
                  type="button"
                  onClick={() => setExpenseDialog({ open: true, id: null })}
                  className="press hover-lift focus-ring flex h-11 items-center gap-2 rounded-[1.35rem] bg-primary px-5 text-sm font-bold text-primary-foreground shadow-primary"
                >
                  <Plus className="h-5 w-5" strokeWidth={2.5} /> Novo gasto
                </button>
              )}
            </div>
            {personSegmented ? (
              <div className="mx-auto mt-3 flex w-full max-w-[1100px]">
                <div className="max-w-md flex-1">{personSegmented}</div>
              </div>
            ) : null}
          </header>

          <main className="flex-1 px-8 py-6">
            <div className="mx-auto w-full max-w-[1100px]">{content}</div>
          </main>
        </div>

        {dialogs}
      </div>
    );
  }

  return (
    <div className="app-backdrop min-h-dvh">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-background/30">
        {/* Header */}
        <header className="sticky top-0 z-20 border-b border-white/6 bg-background/88 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-[22px]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{activeMonthLabel}</p>
              <h1 className="mt-1 truncate font-display text-[2rem] leading-none text-foreground">
                {view === "assistant" ? `Olá, ${firstName}` : titles[view]}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <HideValuesToggle hidden={hideValues} onClick={toggleHideValues} />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((value) => !value)}
                  className="hero-gradient press focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.95rem] text-sm font-bold text-primary-foreground shadow-primary"
                  aria-label="Abrir opcoes do perfil"
                >
                  {initials}
                </button>
                {profileMenuOpen ? (
                  <div className="absolute right-0 top-12 z-40 w-[260px]">{profileMenu}</div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">{monthPicker}</div>

          {personSegmented ? <div className="mt-3">{personSegmented}</div> : null}
        </header>

        {/* Content */}
        <main className="flex-1 px-5 pb-32 pt-4">{content}</main>

        <BottomNav
          view={view}
          onChange={setView}
          onAdd={() => setExpenseDialog({ open: true, id: null })}
        />
      </div>

      {hiddenImport}
      {dialogs}
    </div>
  );
}

function HideValuesToggle({ hidden, onClick }: { hidden: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={hidden}
      aria-label={hidden ? "Mostrar valores" : "Ocultar valores"}
      title={hidden ? "Mostrar valores" : "Ocultar valores"}
      className={`press focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.95rem] border border-white/12 bg-white/[0.07] transition-colors ${
        hidden ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {hidden ? <EyeOff className="h-[18px] w-[18px]" strokeWidth={2} /> : <Eye className="h-[18px] w-[18px]" strokeWidth={2} />}
    </button>
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
