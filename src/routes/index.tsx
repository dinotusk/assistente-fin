import { createFileRoute } from "@tanstack/react-router";

import { AppHome } from "@/components/app/AppHome";
import { AuthScreen } from "@/components/app/AuthScreen";
import { FinanceProvider, useFinance } from "@/lib/finance/FinanceContext";

export const Route = createFileRoute("/")({
  component: Index,
});

function Gate() {
  const { ready, activeUser } = useFinance();
  if (!ready) {
    return <div className="app-backdrop min-h-dvh" />;
  }
  return activeUser ? <AppHome /> : <AuthScreen />;
}

function Index() {
  return (
    <FinanceProvider>
      <Gate />
    </FinanceProvider>
  );
}
