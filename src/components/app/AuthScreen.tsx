import { useState } from "react";
import { Bell, ShieldCheck, Sparkles } from "lucide-react";

import { useFinance } from "@/lib/finance/FinanceContext";

import { AvalMark } from "./ui";

const PITCH_ITEMS = [
  {
    icon: Sparkles,
    title: "Assistente com IA",
    desc: "Converse em texto livre: registre gastos, pergunte o que quiser e receba uma leitura clara do seu mês.",
  },
  {
    icon: Bell,
    title: "Vigias que avisam sozinhos",
    desc: "Regras que observam seus dados e falam na conversa antes de você precisar perguntar.",
  },
  {
    icon: ShieldCheck,
    title: "Seus dados, sua casa",
    desc: "Sincronizado entre seus aparelhos, visível só para quem você convidar.",
  },
];

export function AuthScreen() {
  const { login, register } = useFinance();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFeedback("");

    if (!email.trim() || !password) {
      setFeedback("Preencha e-mail e senha.");
      return;
    }
    if (mode === "register" && !name.trim()) {
      setFeedback("Informe seu nome para criar a conta.");
      return;
    }
    if (password.length < 6) {
      setFeedback("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (mode === "register") {
        await register(name.trim(), normalizedEmail, password);
      } else {
        await login(name.trim() || normalizedEmail, normalizedEmail, password);
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Nao foi possivel continuar agora.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-backdrop flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="flex w-full max-w-[920px] flex-col items-center gap-8 lg:flex-row lg:items-stretch lg:gap-14">
        <div className="flex max-w-[420px] flex-col justify-center gap-6 text-center lg:text-left">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary ring-1 ring-primary/25 lg:mx-0">
            <AvalMark size={28} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Aval</p>
            <h1 className="mt-1.5 font-display text-[2rem] leading-[1.15] text-foreground">
              Seu dinheiro, <span className="text-primary">com mais clareza.</span>
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              O assistente financeiro com IA que acompanha sua casa, planeja com você e avisa antes de apertar.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {PITCH_ITEMS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3 text-left">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <strong className="block text-sm font-bold text-foreground">{title}</strong>
                  <span className="text-[13px] leading-relaxed text-muted-foreground">{desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="card-surface flex w-full max-w-[400px] flex-col gap-6 p-7"
        >
          <div className="flex flex-col gap-1.5">
            <h2 className="font-display text-3xl text-foreground">
              {mode === "login" ? "Entre na sua casa" : "Crie sua conta"}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Seus dados ficam protegidos e sincronizados entre seus dispositivos.
            </p>
          </div>

        <div className="grid grid-cols-2 rounded-xl bg-secondary p-1">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setFeedback("");
            }}
            className={`h-10 rounded-lg text-sm font-semibold transition ${
              mode === "login" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setFeedback("");
            }}
            className={`h-10 rounded-lg text-sm font-semibold transition ${
              mode === "register" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            Criar conta
          </button>
        </div>

        {mode === "register" && (
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
              Seu nome
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              placeholder="Como deseja ser chamado"
              className="h-12 rounded-xl border border-input bg-secondary px-4 text-base text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/70 focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/12"
            />
          </label>
        )}

        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            E-mail
          </span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            className="h-12 rounded-xl border border-input bg-secondary px-4 text-base text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/70 focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/12"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            Senha
          </span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            minLength={6}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            placeholder="Minimo de 6 caracteres"
            className="h-12 rounded-xl border border-input bg-secondary px-4 text-base text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/70 focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/12"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="hero-gradient press focus-ring h-12 rounded-xl text-base font-semibold text-primary-foreground shadow-primary disabled:opacity-60"
        >
          {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
        </button>
        {feedback && <small className="text-center text-sm text-destructive">{feedback}</small>}
        </form>
      </div>
    </div>
  );
}
