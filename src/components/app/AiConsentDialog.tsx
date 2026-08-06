import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { getAiConsentGrantedAt, grantAiConsent, revokeAiConsent } from "@/lib/finance/aiConsent";
import { useFinance } from "@/lib/finance/FinanceContext";

import { SheetShell } from "./dialogs";

const CONSENT_BODY =
  "Para responder, o assistente envia ao provedor de IA (Gemini) um resumo do mes atual: total gasto, pendencias, orcamento e uma lista curta de gastos e metas recentes — sem e-mail, sem senha e sem identificadores internos. Nada e enviado sem essa autorizacao, e voce pode revogar quando quiser aqui em Configuracoes.";

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
      title={mode === "request" ? "Usar o assistente de IA" : "Assistente de IA"}
    >
      <div className="flex flex-col items-center gap-3 rounded-[1.6rem] border border-border bg-secondary/60 p-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <p className="text-sm text-muted-foreground">{CONSENT_BODY}</p>
        {mode === "manage" && accepted && grantedAt && (
          <p className="text-xs text-muted-foreground">
            Autorizado em {new Date(grantedAt).toLocaleDateString("pt-BR")}
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {mode === "request" ? (
        <div className="sticky bottom-0 -mx-5 mt-5 flex gap-3 border-t border-border/70 bg-card/95 px-5 py-3 backdrop-blur">
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
        <div className="sticky bottom-0 -mx-5 mt-5 flex flex-col gap-3 border-t border-border/70 bg-card/95 px-5 py-3 backdrop-blur">
          {accepted ? (
            <button
              type="button"
              onClick={revoke}
              disabled={busy || checking}
              className="press focus-ring h-12 w-full rounded-xl border border-input bg-secondary font-semibold text-destructive hover:bg-muted disabled:opacity-60"
            >
              {busy ? "Revogando..." : "Revogar consentimento"}
            </button>
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
