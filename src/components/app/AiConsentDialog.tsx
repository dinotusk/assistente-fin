import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { getAiConsentGrantedAt, grantAiConsent, revokeAiConsent } from "@/lib/finance/aiConsent";
import { useFinance } from "@/lib/finance/FinanceContext";

import { SheetShell } from "./dialogs";

// P0-05B round 2.1: the context sent per question is now selective (see
// buildAiContext/classifyAiIntent) — this copy describes what CAN be sent
// depending on the question, never claims a fixed bundle is always sent, and
// never claims nothing/nothing-identifying is sent (responsavel, on a bill or
// goal, can be a household member's name).
const REQUEST_INTRO =
  "Para responder suas perguntas, o Aval envia ao Gemini um contexto financeiro limitado, escolhido de acordo com o tipo da pergunta.";
const REQUEST_MAY_INCLUDE =
  "Dependendo do que você perguntar, esse contexto pode incluir valores do mês, totais por categoria, informações das suas metas ou algumas contas pendentes, como descrição, valor, responsável e vencimento.";
const REQUEST_NEVER_INCLUDES =
  "O Aval não envia seu e-mail, senha, identificadores internos da conta ou da casa, o histórico completo dos seus meses nem conversas anteriores.";
const REQUEST_REVOKE_ANYTIME = "Você pode revogar essa autorização a qualquer momento.";

const MANAGE_INTRO =
  "O Aval compartilha com o Gemini apenas um contexto financeiro limitado para responder suas perguntas. O conteúdo enviado varia conforme o tipo da pergunta.";

const MAY_INCLUDE_ITEMS = [
  "resumo financeiro do mês",
  "totais por categoria",
  "metas e progresso",
  "contas pendentes, incluindo responsável e vencimento quando disponíveis",
];

const NEVER_INCLUDES_ITEMS = [
  "e-mail",
  "senha",
  "identificadores internos",
  "histórico completo dos meses",
  "conversas anteriores",
];

const REVOKE_HELPER_TEXT =
  "Ao revogar, o Aval volta a responder só com cálculos locais, sem enviar nada ao Gemini.";

/**
 * Two modes: "request" is shown right before the first Gemini call (Aceitar/Cancelar,
 * blocks the pending question on decline). "manage" is opened from Settings to review
 * or revoke a consent already granted. Grant/revoke always write to Supabase first
 * (the server's source of truth, checked on every /api/gemini-chat call) — the local
 * aiConsent.ts cache is only updated after that write succeeds.
 */
export function AiConsentDialog({
  open,
  onOpenChange,
  mode,
  onAccept,
  onDecline,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "request" | "manage";
  onAccept?: () => void;
  onDecline?: () => void;
}) {
  const {
    saveAiConsent,
    revokeAiConsent: revokeAiConsentRemote,
    getAiConsentStatus,
  } = useFinance();
  const [accepted, setAccepted] = useState(false);
  const [grantedAt, setGrantedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || mode !== "manage") return;
    let cancelled = false;
    setChecking(true);
    setError(null);
    getAiConsentStatus()
      .then((status) => {
        if (cancelled) return;
        setAccepted(status.granted);
        setGrantedAt(status.acceptedAt);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Nao foi possivel verificar o consentimento agora.");
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, getAiConsentStatus]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await saveAiConsent();
      grantAiConsent();
      setAccepted(true);
      setGrantedAt(getAiConsentGrantedAt());
      onAccept?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar o consentimento.");
    } finally {
      setBusy(false);
    }
  }

  function decline() {
    onOpenChange(false);
    onDecline?.();
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      await revokeAiConsentRemote();
      revokeAiConsent();
      setAccepted(false);
      setGrantedAt(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel revogar agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetShell
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "request" ? "Ativar respostas com IA" : "Assistente de IA"}
    >
      <div className="flex flex-col items-center gap-4 rounded-[1.6rem] border border-border bg-secondary/60 p-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <ShieldCheck className="h-6 w-6" />
        </span>
        {mode === "request" ? (
          <div className="flex flex-col gap-3 text-left text-sm text-muted-foreground">
            <p>{REQUEST_INTRO}</p>
            <p>{REQUEST_MAY_INCLUDE}</p>
            <p>{REQUEST_NEVER_INCLUDES}</p>
            <p>{REQUEST_REVOKE_ANYTIME}</p>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-4 text-left text-sm text-muted-foreground">
            <p>{MANAGE_INTRO}</p>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-foreground">
                Pode incluir
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                {MAY_INCLUDE_ITEMS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-foreground">
                Não inclui
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                {NEVER_INCLUDES_ITEMS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {mode === "manage" && accepted && grantedAt && (
          <p className="text-xs text-muted-foreground">
            Autorizado em {new Date(grantedAt).toLocaleDateString("pt-BR")}
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {mode === "request" ? (
        <div className="sticky bottom-0 -mx-5 mt-5 flex gap-3 glass-surface px-5 py-3">
          <button
            type="button"
            onClick={decline}
            disabled={busy}
            className="press focus-ring h-12 flex-1 rounded-xl border border-input bg-secondary font-semibold text-foreground hover:bg-muted disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={accept}
            disabled={busy}
            className="hero-gradient press focus-ring h-12 flex-1 rounded-xl font-semibold text-primary-foreground shadow-primary disabled:opacity-60"
          >
            {busy ? "Salvando..." : "Aceitar e continuar"}
          </button>
        </div>
      ) : (
        <div className="sticky bottom-0 -mx-5 mt-5 flex flex-col gap-3 glass-surface px-5 py-3">
          {accepted ? (
            <>
              <p className="text-center text-xs text-muted-foreground">{REVOKE_HELPER_TEXT}</p>
              <button
                type="button"
                onClick={revoke}
                disabled={busy || checking}
                className="press focus-ring h-12 w-full rounded-xl border border-input bg-secondary font-semibold text-destructive hover:bg-muted disabled:opacity-60"
              >
                {busy ? "Revogando..." : "Revogar consentimento"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={accept}
              disabled={busy || checking}
              className="hero-gradient press focus-ring h-12 w-full rounded-xl font-semibold text-primary-foreground shadow-primary disabled:opacity-60"
            >
              {busy ? "Salvando..." : "Autorizar"}
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="press focus-ring h-12 w-full rounded-xl border border-input bg-secondary font-semibold text-foreground hover:bg-muted"
          >
            Fechar
          </button>
        </div>
      )}
    </SheetShell>
  );
}
