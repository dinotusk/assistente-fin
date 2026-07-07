import { useState } from "react";

import { useFinance } from "@/lib/finance/FinanceContext";

export function AuthScreen() {
  const { login } = useFinance();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !pin.trim()) {
      setFeedback("Informe nome e PIN para continuar.");
      return;
    }
    setLoading(true);
    try {
      await login(name.trim(), pin.trim());
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível entrar agora.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-backdrop flex min-h-dvh items-center justify-center px-5 py-10">
      <form
        onSubmit={handleSubmit}
        className="card-surface flex w-full max-w-[400px] flex-col gap-6 p-7"
      >
        <div className="hero-gradient flex h-14 w-14 items-center justify-center rounded-2xl font-display text-xl font-bold text-primary-foreground shadow-primary">
          AF
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Assistente Financeiro</p>
          <h1 className="font-display text-2xl font-bold text-foreground">Entre no seu perfil</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Use seu nome e um PIN simples para identificar quem está usando o controle familiar.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Nome</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="h-12 rounded-xl border border-input bg-secondary px-4 text-base text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Senha ou PIN</span>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            type="password"
            autoComplete="current-password"
            className="h-12 rounded-xl border border-input bg-secondary px-4 text-base text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="hero-gradient h-12 rounded-xl font-display text-base font-semibold text-primary-foreground shadow-primary transition active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? "Entrando..." : "Entrar ou criar perfil"}
        </button>
        {feedback && <small className="text-center text-sm text-destructive">{feedback}</small>}
      </form>
    </div>
  );
}
