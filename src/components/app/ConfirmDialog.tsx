// P0-FRONTEND-1B.1 — reusable destructive/important-action confirmation.
// Every caller passes the SAME function it already calls today (no delete
// logic is duplicated here) via onConfirm. This component only owns the
// idle -> confirming -> success/error state machine: it never closes itself
// before onConfirm's promise resolves, blocks double-submit while busy, and
// on failure keeps the dialog open with a visible error instead of a silent
// or premature "success".
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { SheetShell } from "./dialogs";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busyLabel = "Aguarde...",
  cancelLabel = "Cancelar",
  destructive = true,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  busyLabel?: string;
  cancelLabel?: string;
  /** Visual tone only — every current caller is a destructive action, but a future non-destructive confirmation can opt out. */
  destructive?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same approach as ConflictDialog: this component stays mounted across
  // opens (only `open` toggles), so state from a previous confirmation must
  // not leak into the next one.
  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setError(null);
  }, [open]);

  async function handleConfirm() {
    if (busy) return; // blocks double-tap/double-click from firing the action twice
    setError(null);
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false); // only ever closes AFTER the real write is confirmed
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível concluir agora. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetShell
      open={open}
      onOpenChange={(next) => {
        // Swiping/tapping the scrim away mid-write would otherwise close the
        // dialog while a delete is still in flight — block it exactly like
        // the Cancelar button already is below.
        if (!busy) onOpenChange(next);
      }}
      title={title}
    >
      <div className="flex flex-col gap-3 rounded-[1.6rem] border border-border bg-secondary/60 p-6 text-center">
        <span
          className={`flex h-12 w-12 items-center justify-center self-center rounded-2xl ${
            destructive ? "bg-destructive/10 text-destructive" : "bg-primary-soft text-primary"
          }`}
        >
          <AlertTriangle className="h-6 w-6" />
        </span>
        <p className="text-sm text-muted-foreground">{description}</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* P0-FRONTEND-1B.6: normalized from the informal bg-card/95 + backdrop-blur
          to the real glass token. The destructive button stays 100% opaque —
          glass is only the chrome around it, never the action itself. */}
      <div className="glass-surface sticky bottom-0 -mx-5 mt-5 flex gap-3 px-5 py-3">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={busy}
          className="press focus-ring h-12 flex-1 rounded-xl border border-input bg-secondary font-semibold text-foreground hover:bg-muted disabled:opacity-60"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className={`press focus-ring h-12 flex-1 rounded-xl font-semibold shadow-primary disabled:opacity-60 ${
            destructive
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "hero-gradient text-primary-foreground"
          }`}
        >
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </SheetShell>
  );
}
