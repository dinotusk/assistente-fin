import { useRef } from "react";
import { Users, CalendarCog, Download, Upload, RotateCcw, LogOut, ChevronRight, Rocket, Tag, Landmark, Eye } from "lucide-react";

import { useFinance } from "@/lib/finance/FinanceContext";

import { Panel, PanelHead } from "./ui";

export function SettingsView({
  onEditPeople,
  onEditMonth,
  onEditCategories,
  onImportBank,
  onEditVigias,
}: {
  onEditPeople: () => void;
  onEditMonth: () => void;
  onEditCategories: () => void;
  onImportBank: () => void;
  onEditVigias: () => void;
}) {
  const { activeUser, state, exportData, importData, resetSeed, logout } = useFinance();
  const fileRef = useRef<HTMLInputElement>(null);
  const initials = getInitials(activeUser?.name || "Aval");

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importData(file);
      alert("Importacao concluida. Confira o mes e a visao selecionada.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Nao consegui importar esse arquivo.");
    } finally {
      e.target.value = "";
    }
  }

  const sections: { label: string; rows: SettingsRow[] }[] = [
    {
      label: "Dados",
      rows: [
        { icon: Users, title: "Perfis financeiros", desc: "Adicione, remova ou renomeie as visoes do orçamento.", action: onEditPeople },
        { icon: CalendarCog, title: "Mês atual", desc: "Ajuste renda, repasse e nome do mês selecionado.", action: onEditMonth },
        { icon: Tag, title: "Categorias", desc: "Veja e remova as regras aprendidas por estabelecimento.", action: onEditCategories },
        { icon: Eye, title: "Vigias", desc: "Regras que avisam sozinhas na conversa quando algo importa.", action: onEditVigias },
        { icon: Download, title: "Exportar backup", desc: "Baixe um arquivo JSON com todo o histórico.", action: exportData },
        { icon: Upload, title: "Importar dados", desc: "Carregue backup JSON ou planilha XLS/XLSX.", action: () => fileRef.current?.click() },
        { icon: Landmark, title: "Importar extrato do banco", desc: "Envie um arquivo OFX ou CSV para revisar e importar.", action: onImportBank },
        { icon: RotateCcw, title: "Restaurar exemplo", desc: "Volta para os dados de demonstração.", action: resetSeed },
      ],
    },
    {
      label: "Conta",
      rows: [
        { icon: LogOut, title: "Sair do perfil", desc: "Encerre a sessão neste aparelho.", action: logout, danger: true },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="card-surface hero-texture relative flex flex-col items-center overflow-hidden px-4 py-6 text-center">
        <div className="pointer-events-none absolute -left-12 -top-16 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
        <div className="hero-gradient relative flex h-24 w-24 items-center justify-center rounded-full font-display text-2xl font-bold text-primary-foreground shadow-primary">
          {initials}
        </div>
        <h1 className="relative mt-3 font-display text-[1.6rem] tracking-tight text-foreground">{activeUser?.name || "Perfil"}</h1>
        <div className="relative mt-4 grid w-full grid-cols-2 gap-2.5">
          <div className="panel-flat p-3 text-left">
            <Rocket className="h-4 w-4 text-primary" strokeWidth={2} />
            <strong className="mt-2 block font-display text-lg text-foreground">Grátis</strong>
            <span className="text-[13px] text-muted-foreground">Plano</span>
          </div>
          <div className="panel-flat p-3 text-left">
            <Users className="h-4 w-4 text-primary" strokeWidth={2} />
            <strong className="mt-2 block font-display text-lg text-foreground">{state.people.length}</strong>
            <span className="text-[13px] text-muted-foreground">Perfis ativos</span>
          </div>
        </div>
      </div>

      <Panel>
      <PanelHead title="Configurações" hint="dados e acesso" />
      <input ref={fileRef} type="file" accept=".json,.xls,.xlsx,application/json" className="hidden" onChange={onImport} />
      <div className="flex flex-col gap-5">
        {sections.map((section) => (
          <div key={section.label} className="flex flex-col gap-2.5">
            <span className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{section.label}</span>
            {section.rows.map(({ icon: Icon, title, desc, action, danger }) => (
              <button
                key={title}
                type="button"
                onClick={action}
                className="press focus-ring hover-lift group flex items-center gap-3 rounded-2xl bg-secondary p-3.5 text-left hover:bg-card"
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-card ${danger ? "text-destructive" : "text-primary"}`}>
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm font-bold text-foreground">{title}</strong>
                  <span className="block text-[12px] leading-snug text-muted-foreground">{desc}</span>
                </span>
                <ChevronRight className={`h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 ${danger ? "text-destructive/60" : "text-muted-foreground"}`} />
              </button>
            ))}
          </div>
        ))}
      </div>
      </Panel>
    </div>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "A";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1];
  return `${first || ""}${second || ""}`.toLocaleUpperCase("pt-BR").slice(0, 2);
}

interface SettingsRow {
  icon: typeof Users;
  title: string;
  desc: string;
  action: () => void;
  danger?: boolean;
}
