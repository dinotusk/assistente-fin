// P0-FRONTEND-1C.1 — Conta e Segurança. Read-only/low-risk pieces only this
// round: Minha Conta, Dados pessoais (read-only), Segurança e acesso,
// Alterar senha, Membros da casa (read-only). Alterar e-mail, esqueci minha
// senha, exclusão de conta funcional, remover membro e MFA are explicitly
// out of scope — see the P0-FRONTEND-1C audit for why.
import { useEffect, useState } from "react";
import {
  ChevronRight,
  Download,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";

import { useFinance } from "@/lib/finance/FinanceContext";
import type { HouseholdMemberRow } from "@/lib/finance/supabaseRepository";

import { SheetShell } from "./dialogs";
import { Field, TextInput } from "./forms";
import { GoogleMark } from "./ui";

const MIN_PASSWORD_LENGTH = 6;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "A";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1];
  return `${first || ""}${second || ""}`.toLocaleUpperCase("pt-BR").slice(0, 2);
}

function Row({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: typeof UserRound;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press focus-ring flex items-center gap-3 rounded-2xl bg-secondary p-3.5 text-left hover:bg-card"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-card text-primary">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm font-bold text-foreground">{title}</strong>
        <span className="block text-[12px] leading-snug text-muted-foreground">{desc}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/* ---------------- Minha conta ---------------- */
export function AccountDialog({
  open,
  onOpenChange,
  onOpenPersonalData,
  onOpenSecurity,
  onOpenMembers,
  onOpenAiConsent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenPersonalData: () => void;
  onOpenSecurity: () => void;
  onOpenMembers: () => void;
  onOpenAiConsent: () => void;
}) {
  const { activeUser, logout } = useFinance();
  const initials = getInitials(activeUser?.name || "Aval");

  return (
    <SheetShell open={open} onOpenChange={onOpenChange} title="Minha conta">
      <div className="flex flex-col items-center gap-1 rounded-[1.6rem] bg-secondary/60 p-5 text-center">
        <div className="hero-gradient flex h-16 w-16 items-center justify-center rounded-full font-display text-xl font-bold text-primary-foreground shadow-primary">
          {initials}
        </div>
        <strong className="mt-2 font-display text-lg text-foreground">
          {activeUser?.name || "Perfil"}
        </strong>
        <span className="text-sm text-muted-foreground">
          {activeUser?.email || "E-mail não disponível"}
        </span>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <Row
          icon={UserRound}
          title="Dados pessoais"
          desc="Seu nome de exibição."
          onClick={onOpenPersonalData}
        />
        <Row
          icon={ShieldCheck}
          title="Segurança e acesso"
          desc="Senha e login conectado."
          onClick={onOpenSecurity}
        />
        <Row
          icon={UsersRound}
          title="Casa e membros"
          desc="Quem está na sua casa."
          onClick={onOpenMembers}
        />
        <Row
          icon={Sparkles}
          title="Privacidade e IA"
          desc="O que é enviado ao assistente."
          onClick={onOpenAiConsent}
        />
        <Row
          icon={Download}
          title="Dados e backup"
          desc="Exportar, importar e restaurar — em Configurações."
          onClick={() => onOpenChange(false)}
        />
      </div>

      <button
        type="button"
        onClick={() => {
          onOpenChange(false);
          logout();
        }}
        className="press focus-ring mt-5 h-12 w-full rounded-xl border border-input bg-secondary font-semibold text-foreground hover:bg-muted"
      >
        Sair
      </button>

      <div className="mt-5 rounded-2xl border border-dashed border-destructive/30 bg-destructive/5 p-4">
        <strong className="block text-sm font-bold text-destructive">Zona de perigo</strong>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          Excluir conta ainda não está disponível — chega em uma próxima atualização.
        </p>
      </div>
    </SheetShell>
  );
}

/* ---------------- Dados pessoais (read-only) ---------------- */
export function PersonalDataDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { activeUser } = useFinance();

  return (
    <SheetShell open={open} onOpenChange={onOpenChange} title="Dados pessoais">
      <div className="flex flex-col gap-4">
        <Field label="Nome">
          <TextInput value={activeUser?.name || ""} readOnly disabled />
        </Field>
        <Field label="E-mail">
          <TextInput value={activeUser?.email || "Não disponível"} readOnly disabled />
        </Field>
        <p className="text-[12px] text-muted-foreground">
          Edição de nome e e-mail chega em uma próxima atualização.
        </p>
      </div>
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className="press focus-ring mt-5 h-12 w-full rounded-xl border border-input bg-secondary font-semibold text-foreground hover:bg-muted"
      >
        Fechar
      </button>
    </SheetShell>
  );
}

/* ---------------- Segurança e acesso ---------------- */
export function SecurityDialog({
  open,
  onOpenChange,
  onOpenChangePassword,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenChangePassword: () => void;
}) {
  const { logout, getLinkedProviders } = useFinance();
  const [checking, setChecking] = useState(true);
  const [providers, setProviders] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setChecking(true);
    setError(null);
    getLinkedProviders()
      .then((list) => {
        if (!cancelled) setProviders(list);
      })
      .catch(() => {
        if (!cancelled) setError("Não foi possível verificar o login conectado agora.");
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, getLinkedProviders]);

  const googleConnected = providers.includes("google");
  const googleStatus = checking
    ? "Verificando..."
    : error
      ? error
      : googleConnected
        ? "Conectado"
        : "Não conectado";

  return (
    <SheetShell open={open} onOpenChange={onOpenChange} title="Segurança e acesso">
      <div className="flex flex-col gap-2">
        <Row
          icon={KeyRound}
          title="Alterar senha"
          desc="Defina uma nova senha para sua conta."
          onClick={onOpenChangePassword}
        />

        <div className="flex items-center gap-3 rounded-2xl bg-secondary p-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-card text-primary">
            <GoogleMark size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-sm font-bold text-foreground">Login com Google</strong>
            <span className="block text-[12px] text-muted-foreground">{googleStatus}</span>
          </span>
          {checking && (
            <Loader2
              className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
              aria-label="Verificando"
            />
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          onOpenChange(false);
          logout();
        }}
        className="press focus-ring mt-5 h-12 w-full rounded-xl border border-input bg-secondary font-semibold text-destructive hover:bg-muted"
      >
        Sair deste aparelho
      </button>
    </SheetShell>
  );
}

/* ---------------- Alterar senha ---------------- */
export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { updatePassword } = useFinance();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setConfirm("");
    setError(null);
    setSuccess(false);
    setBusy(false);
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setBusy(true);
    try {
      await updatePassword(password);
      setSuccess(true);
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar a senha agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetShell open={open} onOpenChange={onOpenChange} title="Alterar senha">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nova senha">
          <TextInput
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            placeholder={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`}
            disabled={busy}
            required
          />
        </Field>
        <Field label="Confirmar nova senha">
          <TextInput
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            placeholder="Repita a nova senha"
            disabled={busy}
            required
          />
        </Field>
        {error && (
          <p className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-2xl border border-success/30 bg-success/10 p-4 text-sm text-success">
            Senha alterada com sucesso.
          </p>
        )}
        {/* P0-FRONTEND-1B.6: normalized from the informal bg-card/95 + backdrop-blur. */}
        <div className="glass-surface sticky bottom-0 -mx-5 mt-5 flex gap-3 px-5 py-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="press focus-ring h-12 flex-1 rounded-xl border border-input bg-secondary font-semibold text-foreground hover:bg-muted disabled:opacity-60"
          >
            {success ? "Fechar" : "Cancelar"}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="hero-gradient press focus-ring h-12 flex-1 rounded-xl font-semibold text-primary-foreground shadow-primary disabled:opacity-60"
          >
            {busy ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </SheetShell>
  );
}

/* ---------------- Membros da casa (somente leitura) ---------------- */
const ROLE_LABELS: Record<string, string> = {
  owner: "Dono",
  admin: "Administrador",
  member: "Membro",
};

function formatJoinedDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR");
}

export function MembersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { activeUser, listHouseholdMembers } = useFinance();
  const [members, setMembers] = useState<HouseholdMemberRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMembers(null);
    setError(null);
    listHouseholdMembers()
      .then((rows) => {
        if (!cancelled) setMembers(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Não foi possível carregar os membros agora.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, listHouseholdMembers]);

  return (
    <SheetShell open={open} onOpenChange={onOpenChange} title="Membros da casa">
      {members === null && !error && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Carregando membros" />
        </div>
      )}
      {error && (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {members && members.length > 0 && (
        <div className="flex flex-col gap-2">
          {members.map((member) => (
            <div
              key={member.userId}
              className="flex items-center gap-3 rounded-2xl bg-secondary p-3.5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-card text-primary">
                <UserRound className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <strong className="block text-sm font-bold text-foreground">
                  {member.isSelf ? activeUser?.name || "Você" : "Membro da casa"}
                  {member.isSelf && (
                    <span className="ml-1.5 text-[11px] font-semibold text-primary">(você)</span>
                  )}
                </strong>
                <span className="block text-[12px] text-muted-foreground">
                  {ROLE_LABELS[member.role] || member.role} · desde{" "}
                  {formatJoinedDate(member.joinedAt)}
                </span>
                {member.isSelf && activeUser?.email && (
                  <span className="block text-[12px] text-muted-foreground">
                    {activeUser.email}
                  </span>
                )}
              </div>
            </div>
          ))}
          <p className="mt-1 text-center text-[12px] leading-relaxed text-muted-foreground">
            Por enquanto só o seu próprio nome e e-mail aparecem aqui — nomes de outros membros
            chegam em uma próxima atualização.
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className="press focus-ring mt-5 h-12 w-full rounded-xl border border-input bg-secondary font-semibold text-foreground hover:bg-muted"
      >
        Fechar
      </button>
    </SheetShell>
  );
}
