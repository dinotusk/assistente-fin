import { useRef } from "react";
import { Users, CalendarCog, Download, Upload, RotateCcw, LogOut, ChevronRight } from "lucide-react";

import { useFinance } from "@/lib/finance/FinanceContext";

import { Panel, PanelHead } from "./ui";

export function SettingsView({
  onEditPeople,
  onEditMonth,
}: {
  onEditPeople: () => void;
  onEditMonth: () => void;
}) {
  const { exportData, importData, resetSeed, logout } = useFinance();
  const fileRef = useRef<HTMLInputElement>(null);

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
        { icon: Download, title: "Exportar backup", desc: "Baixe um arquivo JSON com todo o histórico.", action: exportData },
        { icon: Upload, title: "Importar dados", desc: "Carregue backup JSON ou planilha XLS/XLSX.", action: () => fileRef.current?.click() },
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
                className="press focus-ring group flex items-center gap-3 rounded-2xl border border-border bg-secondary p-3.5 text-left hover:border-primary/25 hover:bg-card"
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
  );
}

interface SettingsRow {
  icon: typeof Users;
  title: string;
  desc: string;
  action: () => void;
  danger?: boolean;
}
