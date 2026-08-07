import { useState } from "react";
import { Bell, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";

import { useFinance } from "@/lib/finance/FinanceContext";

import { AvalMark, GoogleMark } from "./ui";

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

function inviteCodeFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("convite") || "";
}

export function AuthScreen() {
  const { login, register, loginWithGoogle } = useFinance();
  const initialInvite = inviteCodeFromUrl();
  const [mode, setMode] = useState<"login" | "register">(initialInvite ? "register" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(initialInvite);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleGoogle() {
    setFeedback("");
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Não foi possível continuar com o Google agora.",
      );
      setGoogleLoading(false);
    }
  }

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
        await register(name.trim(), normalizedEmail, password, inviteCode.trim() || undefined);
      } else {
        await login(name.trim() || normalizedEmail, normalizedEmail, password);
      }
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Não foi possível continuar agora. Confira seus dados e tente de novo.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-backdrop flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="relative grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[0.95fr_1fr] lg:gap-16">
        <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-3xl" />

        <div className="relative flex flex-col justify-center text-center lg:text-left">
          <div className="relative z-10 max-w-[520px]">
            <div className="relative mx-auto mb-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary ring-1 ring-primary/25 lg:mx-0">
              <div className="pointer-events-none absolute -inset-3 -z-10 rounded-full bg-primary/12 blur-2xl" />
              <AvalMark size={28} />
            </div>

            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Aval</p>
            <h1 className="mt-3 font-display text-[2.8rem] leading-[1.02] tracking-tight text-foreground sm:text-[3.65rem]">
              Seu dinheiro, <span className="text-primary">com mais clareza.</span>
            </h1>
            <p className="mt-5 max-w-[470px] text-base leading-relaxed text-foreground/80">
              O assistente financeiro com IA que acompanha sua casa, planeja com você e avisa antes
              de apertar.
            </p>
          </div>

          <div className="relative z-10 mt-8 flex flex-col gap-4">
            <div className="pointer-events-none absolute bottom-4 left-[17px] top-4 hidden w-px bg-linear-to-b from-primary/35 via-primary/12 to-transparent lg:block" />
            {PITCH_ITEMS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="relative flex items-start gap-3 text-left">
                <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary ring-1 ring-primary/15">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <strong className="block text-sm font-bold text-foreground">{title}</strong>
                  <span className="text-[13px] leading-relaxed text-muted-foreground">{desc}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="pointer-events-none absolute bottom-6 right-12 hidden h-24 w-24 rounded-full border-[10px] border-primary/20 xl:block" />
        </div>

        <div className="relative mx-auto w-full max-w-[420px] lg:max-w-[440px]">
          <form
            onSubmit={handleSubmit}
            className="relative overflow-hidden rounded-[2rem] bg-linear-to-br from-[#e6d3a5]/62 via-[#5b4a2c]/30 to-[#0c2018] p-[2px] shadow-float"
          >
            <div className="hero-texture relative overflow-hidden rounded-[1.85rem] border border-white/8 bg-card/94 p-7 backdrop-blur-xl sm:p-8">
              <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
              <div className="pointer-events-none absolute inset-[7px] rounded-[1.45rem] ring-1 ring-white/7" />
              <div className="relative flex flex-col gap-6">
                <div className="flex flex-col gap-1.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-soft text-primary ring-1 ring-primary/15">
                    <MessageCircle className="h-5 w-5" />
                  </span>
                  <h2 className="mt-3 font-display text-3xl text-foreground">
                    {mode === "login" ? "Entre na sua casa" : "Crie sua conta"}
                  </h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Seus dados ficam protegidos e sincronizados entre seus dispositivos.
                  </p>
                </div>

                <div className="grid grid-cols-2 rounded-full bg-secondary p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setFeedback("");
                    }}
                    className={`h-10 rounded-full text-sm font-semibold transition ${
                      mode === "login"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground"
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
                    className={`h-10 rounded-full text-sm font-semibold transition ${
                      mode === "register"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground"
                    }`}
                  >
                    Criar conta
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={googleLoading || loading}
                  className="press focus-ring inline-flex h-12 items-center justify-center gap-2.5 rounded-full border border-input bg-secondary text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
                >
                  <GoogleMark size={18} />
                  {googleLoading ? "Abrindo o Google..." : "Continuar com Google"}
                </button>
                {mode === "register" && inviteCode.trim() && (
                  <p className="-mt-1 text-center text-[11px] text-muted-foreground">
                    Convites funcionam apenas com cadastro por e-mail por enquanto.
                  </p>
                )}

                <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  ou com e-mail
                  <span className="h-px flex-1 bg-border" />
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
                      className="h-12 rounded-full border border-input bg-secondary px-4 text-base text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/70 focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/12"
                    />
                  </label>
                )}

                {mode === "register" && (
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                      Código de convite (opcional)
                    </span>
                    <input
                      value={inviteCode}
                      onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                      placeholder="Cole o código de quem te convidou"
                      className="h-12 rounded-full border border-input bg-secondary px-4 text-base uppercase tracking-widest text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/70 placeholder:normal-case placeholder:tracking-normal focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/12"
                    />
                    <span className="text-[12px] text-muted-foreground">
                      Com um código, você entra direto na casa de quem te convidou e já vê as
                      despesas dela.
                    </span>
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
                    className="h-12 rounded-full border border-input bg-secondary px-4 text-base text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/70 focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/12"
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
                    className="h-12 rounded-full border border-input bg-secondary px-4 text-base text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/70 focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/12"
                  />
                </label>

                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="hero-gradient press focus-ring h-12 rounded-full text-base font-semibold text-primary-foreground shadow-primary disabled:opacity-60"
                >
                  {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
                </button>
                {feedback && (
                  <small className="text-center text-sm text-destructive">{feedback}</small>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
