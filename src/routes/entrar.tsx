import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Loader2, TriangleAlert } from "lucide-react";

import { AuthScreen } from "@/components/app/AuthScreen";
import { FinanceProvider, useFinance } from "@/lib/finance/FinanceContext";

export const Route = createFileRoute("/entrar")({
  component: Entrar,
});

function Gate() {
  const { ready, authError, retryAuth, activeUser } = useFinance();

  if (!ready) {
    return (
      <div className="app-backdrop flex min-h-dvh items-center justify-center px-5">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Carregando" />
      </div>
    );
  }

  if (authError && !activeUser) {
    return (
      <div className="app-backdrop flex min-h-dvh items-center justify-center px-5 py-10">
        <div className="card-surface flex w-full max-w-[400px] flex-col items-center gap-4 p-7 text-center">
          <TriangleAlert className="h-8 w-8 text-destructive" />
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-xl text-foreground">Não foi possível conectar</h1>
            <p className="text-sm text-muted-foreground">{authError}</p>
          </div>
          <button
            onClick={retryAuth}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  return activeUser ? <Navigate to="/" /> : <AuthScreen />;
}

function Entrar() {
  return (
    <FinanceProvider>
      <Gate />
    </FinanceProvider>
  );
}
