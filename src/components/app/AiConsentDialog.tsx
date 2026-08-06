import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

import {
  getAiConsentGrantedAt,
  grantAiConsent,
  hasAiConsent,
  revokeAiConsent,
} from "@/lib/finance/aiConsent";

import { SheetShell } from "./dialogs";

const CONSENT_BODY =
  "Para responder, o assistente envia ao provedor de IA (Gemini) um resumo do mes atual: total gasto, pendencias, orcamento e uma lista curta de gastos e metas recentes — sem e-mail, sem senha e sem identificadores internos. Nada e enviado sem essa autorizacao, e voce pode revogar quando quiser aqui em Configuracoes.";

/**
 * Two modes: "request" is shown right before the first Gemini call (Aceitar/Cancelar,
 * blocks the pending question on decline). "manage" is opened from Settings to review
 * or revoke a consent already granted.
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
  const [accepted, setAccepted] = useState(false);
  const [grantedAt, setGrantedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAccepted(hasAiConsent());
    setGrantedAt(getAiConsentGrantedAt());
  }, [open]);

  function accept() {
    grantAiConsent();
    setAccepted(true);
    setGrantedAt(getAiConsentGrantedAt());
    onAccept?.();
  }

  function decline() {
    onOpenChange(false);
    onDecline?.();
  }

  function revoke() {
    revokeAiConsent();
    setAccepted(false);
    setGrantedAt(null);
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
      </div>

      {mode === "request" ? (
        <div className="sticky bottom-0 -mx-5 mt-5 flex gap-3 border-t border-border/70 bg-card/95 px-5 py-3 backdrop-blur">
          <button
            type="button"
            onClick={decline}
            className="press focus-ring h-12 flex-1 rounded-xl border border-input bg-secondary font-semibold text-foreground hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={accept}
            className="hero-gradient press focus-ring h-12 flex-1 rounded-xl font-semibold text-primary-foreground shadow-primary"
          >
            Aceitar e continuar
          </button>
        </div>
      ) : (
        <div className="sticky bottom-0 -mx-5 mt-5 flex flex-col gap-3 border-t border-border/70 bg-card/95 px-5 py-3 backdrop-blur">
          {accepted ? (
            <button
              type="button"
              onClick={revoke}
              className="press focus-ring h-12 w-full rounded-xl border border-input bg-secondary font-semibold text-destructive hover:bg-muted"
            >
              Revogar consentimento
            </button>
          ) : (
            <button
              type="button"
              onClick={accept}
              className="hero-gradient press focus-ring h-12 w-full rounded-xl font-semibold text-primary-foreground shadow-primary"
            >
              Autorizar
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
