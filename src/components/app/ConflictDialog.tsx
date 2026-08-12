import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { SheetShell } from "./dialogs";

/**
 * Shown when a save fails with WriteNotAppliedError (see writeConflict.ts) —
 * the row changed, was removed, or became inaccessible under us. Never shows
 * a stack trace or a technical message, and never offers an automatic merge:
 * the user either refreshes to see the current data (discarding their
 * pending edit) or closes the dialog and keeps whatever they had, to retry
 * however they choose.
 */
export function ConflictDialog({
  open,
  onRefresh,
  onDismiss,
}: {
  open: boolean;
  onRefresh: () => Promise<void> | void;
  onDismiss: () => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // Clears any error left over from a previous conflict's failed refresh —
  // this component stays mounted across conflicts (only `open` toggles), so
  // without this a new conflict could open showing a stale error message.
  useEffect(() => {
    if (open) setRefreshError(null);
  }, [open]);

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await onRefresh();
      // Success closes the dialog via the caller clearing writeConflict —
      // nothing else to do here.
    } catch {
      setRefreshError("Não foi possível atualizar agora. Tente novamente.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <SheetShell
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
      title="Não foi possível salvar"
    >
      <div className="flex flex-col gap-3 rounded-[1.6rem] border border-border bg-secondary/60 p-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center self-center rounded-2xl bg-primary-soft text-primary">
          <RefreshCw className="h-6 w-6" />
        </span>
        <p className="text-sm text-muted-foreground">
          Este registro mudou ou não está mais disponível.
        </p>
        <p className="text-sm text-muted-foreground">
          Atualize os dados para ver a versão mais recente antes de tentar novamente.
        </p>
        {refreshError && <p className="text-sm text-destructive">{refreshError}</p>}
      </div>

      {/* P0-FRONTEND-1B.6: normalized from the informal bg-card/95 + backdrop-blur. */}
      <div className="glass-surface sticky bottom-0 -mx-5 mt-5 flex gap-3 px-5 py-3">
        <button
          type="button"
          onClick={onDismiss}
          disabled={refreshing}
          className="press focus-ring h-12 flex-1 rounded-xl border border-input bg-secondary font-semibold text-foreground hover:bg-muted disabled:opacity-60"
        >
          Fechar
        </button>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="hero-gradient press focus-ring h-12 flex-1 rounded-xl font-semibold text-primary-foreground shadow-primary disabled:opacity-60"
        >
          {refreshing ? "Atualizando..." : "Atualizar dados"}
        </button>
      </div>
    </SheetShell>
  );
}
