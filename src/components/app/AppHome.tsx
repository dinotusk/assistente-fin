import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Plus,
  CalendarPlus,
  ChevronDown,
  Eye,
  EyeOff,
  LogOut,
  Settings,
  UserRound,
  Users,
} from "lucide-react";

import { formatMonthLabel } from "@/lib/finance/calc";
import { VIEW_ALL, VIEW_ME, VIEW_SPOUSE } from "@/lib/finance/constants";
import { useFinance } from "@/lib/finance/FinanceContext";
import type { ViewKey } from "@/lib/finance/types";

import {
  AccountDialog,
  ChangePasswordDialog,
  MembersDialog,
  PersonalDataDialog,
  SecurityDialog,
} from "./AccountDialogs";
import { AiConsentDialog } from "./AiConsentDialog";
import { AssistantView } from "./AssistantView";
import { ConflictDialog } from "./ConflictDialog";
import { BottomNav } from "./BottomNav";
import { SideNav } from "./SideNav";
import { DashboardView } from "./DashboardView";
import { PrioritiesView } from "./PrioritiesView";
import { SettingsView } from "./SettingsView";
import { TransactionsView } from "./TransactionsView";
import {
  BankImportDialog,
  CategoriesDialog,
  EnvelopesDialog,
  ExpenseDialog,
  InviteDialog,
  JoinHouseholdDialog,
  MonthDialog,
  PeopleDialog,
  PriorityDialog,
  PurchaseSimulatorDialog,
  PushNotificationsDialog,
  VigiasDialog,
} from "./dialogs";
import { Segmented } from "./ui";

const titles: Record<ViewKey, string> = {
  assistant: "Aval",
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
  const {
    activeUser,
    state,
    hideValues,
    toggleHideValues,
    setActivePerson,
    setActiveMonth,
    createNextMonth,
    logout,
    writeConflict,
    refreshAfterConflict,
    dismissWriteConflict,
  } = useFinance();
  const isDesktop = useIsDesktop();
  const [view, setView] = useState<ViewKey>("dashboard");
  // P0-FRONTEND-1B.4: the category tapped on the Painel travels here so
  // Gastos can open pre-filtered; cleared whenever a fresh navigation to
  // Gastos doesn't specify one (see goToTransactions below).
  const [transactionsCategory, setTransactionsCategory] = useState<string | null>(null);
  const [expenseDialog, setExpenseDialog] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const [priorityDialog, setPriorityDialog] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const [monthOpen, setMonthOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [bankImportOpen, setBankImportOpen] = useState(false);
  const [vigiasOpen, setVigiasOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [joinHouseholdOpen, setJoinHouseholdOpen] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [envelopesOpen, setEnvelopesOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [aiConsentOpen, setAiConsentOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [personalDataOpen, setPersonalDataOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const initials = getInitials(activeUser?.name || "Aval");

  // The profile menu (mobile header avatar button, desktop SideNav footer
  // button) is a plain conditionally-rendered popover, not a Radix primitive
  // — it needs its own outside-tap/Escape dismissal instead of relying on one.
  useEffect(() => {
    if (!profileMenuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setProfileMenuOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileMenuOpen]);

  // P0-FRONTEND-1B.4: the Painel's own "Ações rápidas" block already offers
  // "Adicionar gasto", so the FAB would just be a second, redundant way to
  // do the exact same thing on the same screen — kept only on the views
  // that don't have that block.
  const showFab = view === "assistant" || view === "transactions";
  const activeMonthLabel =
    state.months[state.activeMonth]?.label || formatMonthLabel(state.activeMonth);
  const firstName = activeUser?.name?.trim().split(/\s+/)[0] || "Você";

  const profileMenu = (
    <div className="glass-surface-strong animate-glass-in rounded-xl p-3 text-left">
      <div className="mb-3 flex items-center gap-3 rounded-2xl bg-secondary p-3">
        <div className="hero-gradient flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-bold text-primary-foreground">
          {initials}
        </div>
        <div className="min-w-0">
          <strong className="block truncate text-sm font-bold text-foreground">
            {activeUser?.name || "Perfil"}
          </strong>
          <span className="text-xs text-muted-foreground">Conta sincronizada</span>
        </div>
      </div>
      {/* P0-FRONTEND-1B.3: quick identity/account access only — Editar mês,
          Exportar backup and Importar dados were removed from here since
          they're already one tap away in Configurações; nothing was removed
          from the app, only from this shortcut list. */}
      <HeaderMenuButton
        icon={<UserRound className="h-4 w-4" />}
        label="Minha conta"
        onClick={() => {
          setAccountOpen(true);
          setProfileMenuOpen(false);
        }}
      />
      <HeaderMenuButton
        icon={<Users className="h-4 w-4" />}
        label="Perfis financeiros"
        onClick={() => {
          setPeopleOpen(true);
          setProfileMenuOpen(false);
        }}
      />
      <HeaderMenuButton
        icon={<Settings className="h-4 w-4" />}
        label="Configurações"
        onClick={() => {
          setView("settings");
          setProfileMenuOpen(false);
        }}
      />
      <HeaderMenuButton
        icon={<LogOut className="h-4 w-4" />}
        label="Sair do perfil"
        danger
        onClick={() => {
          logout();
          setProfileMenuOpen(false);
        }}
      />
    </div>
  );

  const personSegmented =
    view !== "settings" ? (
      <Segmented
        value={state.activePerson}
        onChange={(v) => setActivePerson(v)}
        options={[
          { value: VIEW_ALL, label: "Minha casa" },
          ...state.people.map((person, index) => ({
            value: index === 0 ? VIEW_ME : index === 1 ? VIEW_SPOUSE : person,
            label: person,
          })),
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
          className="glass-surface focus-ring h-11 w-full appearance-none rounded-lg px-4 pr-10 text-sm font-bold text-foreground outline-none transition focus:border-primary"
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
        className="press focus-ring flex h-11 items-center gap-1.5 rounded-lg bg-primary-soft px-4 text-sm font-bold text-primary shadow-soft hover:bg-primary/15"
        title={`Criar ${formatMonthLabel(state.activeMonth)}`}
      >
        <CalendarPlus className="h-4 w-4" strokeWidth={2.25} /> Mês
      </button>
    </>
  );

  function goToTransactions(category?: string) {
    setTransactionsCategory(category ?? null);
    setView("transactions");
  }

  const content = (
    <div key={view} className="animate-view">
      {view === "dashboard" && (
        <DashboardView
          onOpenCategory={(category) => goToTransactions(category)}
          onViewTransactions={() => goToTransactions()}
          onAddExpense={() => setExpenseDialog({ open: true, id: null })}
          onAddGoal={() => setPriorityDialog({ open: true, id: null })}
          onOpenAval={() => setView("assistant")}
          onEditExpense={(id) => setExpenseDialog({ open: true, id })}
          onEditPeople={() => setPeopleOpen(true)}
        />
      )}
      {view === "transactions" && (
        <TransactionsView
          initialCategory={transactionsCategory}
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
      {view === "assistant" && (
        <AssistantView
          onAddExpense={() => setExpenseDialog({ open: true, id: null })}
          onOpenSimulator={() => setSimulatorOpen(true)}
          onOpenEnvelopes={() => setEnvelopesOpen(true)}
        />
      )}
      {view === "settings" && (
        <SettingsView
          onOpenAccount={() => setAccountOpen(true)}
          onOpenMembers={() => setMembersOpen(true)}
          onEditPeople={() => setPeopleOpen(true)}
          onEditMonth={() => setMonthOpen(true)}
          onEditCategories={() => setCategoriesOpen(true)}
          onImportBank={() => setBankImportOpen(true)}
          onEditVigias={() => setVigiasOpen(true)}
          onInvite={() => setInviteOpen(true)}
          onJoinHousehold={() => setJoinHouseholdOpen(true)}
          onPushNotifications={() => setPushOpen(true)}
          onAiConsent={() => setAiConsentOpen(true)}
        />
      )}
    </div>
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
      <VigiasDialog open={vigiasOpen} onOpenChange={setVigiasOpen} />
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <JoinHouseholdDialog open={joinHouseholdOpen} onOpenChange={setJoinHouseholdOpen} />
      <PurchaseSimulatorDialog open={simulatorOpen} onOpenChange={setSimulatorOpen} />
      <EnvelopesDialog open={envelopesOpen} onOpenChange={setEnvelopesOpen} />
      <PushNotificationsDialog open={pushOpen} onOpenChange={setPushOpen} />
      <AiConsentDialog open={aiConsentOpen} onOpenChange={setAiConsentOpen} mode="manage" />
      <AccountDialog
        open={accountOpen}
        onOpenChange={setAccountOpen}
        onOpenPersonalData={() => setPersonalDataOpen(true)}
        onOpenSecurity={() => setSecurityOpen(true)}
        onOpenMembers={() => setMembersOpen(true)}
        onOpenAiConsent={() => setAiConsentOpen(true)}
      />
      <PersonalDataDialog open={personalDataOpen} onOpenChange={setPersonalDataOpen} />
      <SecurityDialog
        open={securityOpen}
        onOpenChange={setSecurityOpen}
        onOpenChangePassword={() => setChangePasswordOpen(true)}
      />
      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
      <MembersDialog open={membersOpen} onOpenChange={setMembersOpen} />
      <ConflictDialog
        open={Boolean(writeConflict)}
        onRefresh={refreshAfterConflict}
        onDismiss={dismissWriteConflict}
      />
    </>
  );

  if (isDesktop) {
    return (
      <div className="app-backdrop flex min-h-dvh">
        <SideNav
          view={view}
          onChange={(v) => {
            setView(v);
            setProfileMenuOpen(false);
          }}
          footer={
            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setProfileMenuOpen((value) => !value)}
                className="glass-surface press focus-ring flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left"
              >
                <div className="hero-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-primary-foreground">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm font-bold text-foreground">
                    {activeUser?.name || "Perfil"}
                  </strong>
                  <span className="block truncate text-xs text-muted-foreground">
                    Conta sincronizada
                  </span>
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
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary/70">
                  {titles[view]}
                </p>
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
                  className="press hover-lift focus-ring flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground shadow-primary"
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
              <p className="text-2xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {activeMonthLabel}
              </p>
              <h1 className="mt-1 truncate font-display text-display leading-none text-foreground">
                {view === "assistant" ? `Olá, ${firstName}` : titles[view]}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <HideValuesToggle hidden={hideValues} onClick={toggleHideValues} />
              <div className="relative" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((value) => !value)}
                  className="hero-gradient press focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[var(--glass-border)] text-sm font-bold text-primary-foreground shadow-primary"
                  aria-label="Abrir opções do perfil"
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

        <BottomNav view={view} onChange={setView} onOpenAssistant={() => setView("assistant")} />
      </div>

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
      aria-label={hidden ? "Desativar modo privado" : "Ativar modo privado"}
      title={hidden ? "Desativar modo privado" : "Ativar modo privado"}
      className={`glass-surface press focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-colors ${
        hidden ? "glass-active text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {hidden ? (
        <EyeOff className="h-[18px] w-[18px]" strokeWidth={2} />
      ) : (
        <Eye className="h-[18px] w-[18px]" strokeWidth={2} />
      )}
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
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${danger ? "bg-destructive/10" : "bg-primary-soft text-primary"}`}
      >
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
