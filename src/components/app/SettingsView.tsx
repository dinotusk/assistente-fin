import { useRef, useState } from "react";
import {
  Users,
  CalendarCog,
  Download,
  Upload,
  RotateCcw,
  LogOut,
  ChevronRight,
  Tag,
  Landmark,
  Eye,
  UserPlus,
  UserRound,
  UsersRound,
  LogIn,
  Bell,
  ShieldCheck,
  FileText,
  Info,
  Cookie,
} from "lucide-react";
import { toast } from "sonner";

import { summarizeImport } from "@/lib/finance/calc";
import { useFinance } from "@/lib/finance/FinanceContext";

import { ConfirmDialog } from "./ConfirmDialog";

/** No package.json "version" field exists to read at build time — this is the
 *  one place that number lives. Bump it by hand alongside meaningful releases. */
const APP_VERSION = "0.1.0";

export function SettingsView({
  onOpenAccount,
  onOpenMembers,
  onEditPeople,
  onEditMonth,
  onEditCategories,
  onImportBank,
  onEditVigias,
  onInvite,
  onJoinHousehold,
  onPushNotifications,
  onAiConsent,
}: {
  onOpenAccount: () => void;
  onOpenMembers: () => void;
  onEditPeople: () => void;
  onEditMonth: () => void;
  onEditCategories: () => void;
  onImportBank: () => void;
  onEditVigias: () => void;
  onInvite: () => void;
  onJoinHousehold: () => void;
  onPushNotifications: () => void;
  onAiConsent: () => void;
}) {
  const { activeUser, state, exportData, importData, resetSeed, logout } = useFinance();
  const fileRef = useRef<HTMLInputElement>(null);
  const initials = getInitials(activeUser?.name || "Aval");
  const [confirmingReset, setConfirmingReset] = useState(false);

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const summary = await importData(file);
      toast.success(summarizeImport(summary));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não consegui importar esse arquivo. Confira se é um JSON, XLS ou XLSX válido.",
      );
    } finally {
      e.target.value = "";
    }
  }

  const sections: { label: string; rows: SettingsRow[] }[] = [
    {
      label: "Conta",
      rows: [
        {
          icon: UserRound,
          title: "Minha conta",
          desc: "Nome, e-mail, segurança e acesso.",
          action: onOpenAccount,
        },
      ],
    },
    {
      label: "Casa",
      rows: [
        {
          icon: UsersRound,
          title: "Membros",
          desc: "Veja quem está na sua casa e o papel de cada um.",
          action: onOpenMembers,
        },
        {
          icon: UserPlus,
          title: "Convidar para a casa",
          desc: "Gere um código para alguém entrar e ver os mesmos dados.",
          action: onInvite,
        },
        {
          icon: LogIn,
          title: "Entrar em outra casa",
          desc: "Já tem um código? Troque sua casa atual pela de quem te convidou.",
          action: onJoinHousehold,
        },
        {
          icon: Users,
          title: "Perfis financeiros",
          desc: "Adicione, remova ou renomeie as visões do orçamento.",
          action: onEditPeople,
        },
      ],
    },
    {
      label: "Dados",
      rows: [
        {
          icon: CalendarCog,
          title: "Mês atual",
          desc: "Ajuste renda, repasse e nome do mês selecionado.",
          action: onEditMonth,
        },
        {
          icon: Tag,
          title: "Categorias",
          desc: "Veja e remova as regras aprendidas por estabelecimento.",
          action: onEditCategories,
        },
        {
          icon: Eye,
          title: "Vigias",
          desc: "Regras que avisam sozinhas na conversa quando algo importa.",
          action: onEditVigias,
        },
        {
          icon: Bell,
          title: "Notificações push",
          desc: "Avisos de contas vencendo e orçamento no seu aparelho, mesmo com o app fechado.",
          action: onPushNotifications,
        },
        {
          icon: Download,
          title: "Exportar backup",
          desc: "Baixe um arquivo JSON com todo o histórico.",
          action: exportData,
        },
        {
          icon: Upload,
          title: "Importar dados",
          desc: "Carregue backup JSON ou planilha XLS/XLSX.",
          action: () => fileRef.current?.click(),
        },
        {
          icon: Landmark,
          title: "Importar extrato do banco",
          desc: "Envie um arquivo OFX ou CSV para revisar e importar.",
          action: onImportBank,
        },
        {
          icon: RotateCcw,
          title: "Restaurar exemplo",
          desc: "Volta para os dados de demonstração.",
          action: () => setConfirmingReset(true),
        },
      ],
    },
    {
      label: "Assistente de IA",
      rows: [
        {
          icon: ShieldCheck,
          title: "Assistente de IA",
          desc: "Veja o que é enviado ao Gemini e revogue o consentimento quando quiser.",
          action: onAiConsent,
        },
      ],
    },
    {
      label: "Sobre",
      rows: [
        {
          icon: FileText,
          title: "Termos e privacidade",
          desc: "Como tratamos seus dados.",
          action: () => window.open("/termos", "_blank", "noopener,noreferrer"),
        },
        {
          // P0-PRIVACY-COOKIES: o Aval não define cookies nem usa analytics, então
          // não há preferências opcionais a controlar — esta linha é transparência,
          // não consentimento. Se algum dia entrar tecnologia não essencial, este
          // ponto vira a porta de entrada da central de preferências.
          icon: Cookie,
          title: "Cookies e armazenamento",
          desc: "O que o Aval guarda no seu navegador e por quê.",
          action: () => window.open("/termos#cookies", "_blank", "noopener,noreferrer"),
        },
        {
          icon: Info,
          title: "Versão do app",
          desc: `Aval v${APP_VERSION}`,
          action: () => {},
          interactive: false,
        },
      ],
    },
    {
      label: "Ações",
      rows: [
        {
          icon: LogOut,
          title: "Sair do perfil",
          desc: "Encerre a sessão neste aparelho.",
          action: logout,
          danger: true,
        },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Aval Modern (fintech rebuild) — compact identity row instead of a
          big hero card: small avatar + name/email + a one-line plan summary,
          no font-display, no 96px avatar, no two large stat panels. */}
      <button
        type="button"
        onClick={onOpenAccount}
        className="press focus-ring flex items-center gap-3 rounded-lg bg-secondary/60 p-3 text-left hover:bg-secondary"
      >
        <div className="hero-gradient flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-primary-foreground shadow-primary">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-sm font-bold text-foreground">
            {activeUser?.name || "Perfil"}
          </strong>
          <span className="block truncate text-xs text-muted-foreground">
            {activeUser?.email || "E-mail não disponível"}
          </span>
          <span className="mt-0.5 block text-xs text-primary">
            Grátis · {state.people.length} perfis
          </span>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      <input
        ref={fileRef}
        type="file"
        accept=".json,.xls,.xlsx,application/json"
        className="hidden"
        onChange={onImport}
      />
      <div className="flex flex-col gap-4">
        {sections.map((section) => (
          <div key={section.label} className="flex flex-col gap-1.5">
            <span className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {section.label}
            </span>
            <div className="flex flex-col divide-y divide-border/15 rounded-lg bg-secondary/40">
              {section.rows.map(
                ({ icon: Icon, title, desc, action, danger, interactive = true }) =>
                  interactive ? (
                    <button
                      key={title}
                      type="button"
                      onClick={action}
                      className="press focus-ring group flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-secondary/60"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-card ${danger ? "text-destructive" : "text-primary"}`}
                      >
                        <Icon className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block text-sm font-bold text-foreground">{title}</strong>
                        <span className="block truncate text-xs leading-snug text-muted-foreground">
                          {desc}
                        </span>
                      </span>
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 ${danger ? "text-destructive/60" : "text-muted-foreground"}`}
                      />
                    </button>
                  ) : (
                    <div key={title} className="flex items-center gap-2.5 px-3 py-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-card text-primary">
                        <Icon className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block text-sm font-bold text-foreground">{title}</strong>
                        <span className="block truncate text-xs leading-snug text-muted-foreground">
                          {desc}
                        </span>
                      </span>
                    </div>
                  ),
              )}
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmingReset}
        onOpenChange={setConfirmingReset}
        title="Restaurar dados de exemplo?"
        description="Os dados atuais serão substituídos pelos dados de exemplo. Esta ação não pode ser desfeita."
        confirmLabel="Restaurar exemplo"
        busyLabel="Restaurando..."
        onConfirm={resetSeed}
      />
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
  /** false renders a plain, non-interactive info row (no button, no chevron) — for display-only entries like the app version. Defaults to true. */
  interactive?: boolean;
}
