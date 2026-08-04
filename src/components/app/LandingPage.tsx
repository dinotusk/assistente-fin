import { Link } from "@tanstack/react-router";
import {
  Bell,
  Eye,
  FileSpreadsheet,
  Home,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Utensils,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { AvalMark } from "./ui";

/** Fades a section in once it scrolls into view. Respects prefers-reduced-motion globally via styles.css. */
function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-all duration-700 ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

const NAV_LINKS = [
  { href: "#recursos", label: "Recursos" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#seguranca", label: "Segurança" },
];

const FEATURES = [
  {
    icon: MessageCircle,
    title: "Assistente com IA",
    desc: "Converse em texto livre: registre gastos, pergunte o que quiser e receba uma leitura clara do seu mês.",
  },
  {
    icon: Bell,
    title: "Vigias que avisam sozinhos",
    desc: "Regras que observam seus dados e falam na conversa antes de você precisar perguntar.",
  },
  {
    icon: FileSpreadsheet,
    title: "Importe seu extrato",
    desc: "Envie um arquivo OFX ou CSV do banco e revise os lançamentos antes de confirmar a importação.",
  },
  {
    icon: Users,
    title: "Feito para a casa toda",
    desc: "Perfis por pessoa e uma visão conjunta, para decidir gastos em família sem planilha compartilhada.",
  },
  {
    icon: Target,
    title: "Prioridades do mês",
    desc: "Liste o que precisa pagar e veja na hora o que cabe no orçamento livre.",
  },
  {
    icon: Eye,
    title: "Modo privado",
    desc: "Oculte os valores da tela com um toque, útil na frente de quem não precisa ver.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Registre ou importe",
    desc: "Anote um gasto conversando com o Aval, ou importe o extrato do banco em OFX/CSV.",
  },
  {
    n: "2",
    title: "Converse com o Aval",
    desc: "Pergunte no que está gastando mais, o que sobra este mês, ou o que dá pra pagar agora.",
  },
  {
    n: "3",
    title: "Receba avisos antes de apertar",
    desc: "Vigias observam seus dados e avisam na conversa quando algo importa, sem você precisar perguntar.",
  },
];

const SECURITY_POINTS = [
  "Seus dados ficam em um banco protegido por regras de acesso por usuário. Só você e quem convidar veem sua casa.",
  "Sincronização entre aparelhos, sem depender de planilha compartilhada ou capturas de tela.",
  "Sem anúncios e sem venda de dados: o Aval existe para organizar sua casa, não para te vender coisas.",
  "Exporte um backup completo em JSON quando quiser, sem pedir permissão a ninguém.",
];

export function LandingPage() {
  return (
    <div className="app-backdrop min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <a href="#top" className="flex items-center gap-2">
            <AvalMark size={24} />
            <span className="font-display text-lg text-foreground">Aval</span>
          </a>
          <nav className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <Link
            to="/entrar"
            className="press focus-ring rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-primary"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="relative mx-auto flex max-w-6xl flex-col items-center gap-10 overflow-hidden px-5 pb-20 pt-14 text-center lg:pt-20">
          <div className="animate-float pointer-events-none absolute -top-24 left-1/2 -z-10 h-72 w-72 -translate-x-[70%] rounded-full bg-primary/14 blur-3xl" />
          <div
            className="animate-float pointer-events-none absolute -top-10 left-1/2 -z-10 h-96 w-96 translate-x-[20%] rounded-full bg-primary/8 blur-3xl"
            style={{ animationDelay: "-3.5s" }}
          />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3.5 py-1.5 text-xs font-semibold text-primary ring-1 ring-primary/20">
            <Sparkles className="h-3.5 w-3.5" /> Assistente financeiro para a sua casa
          </span>
          <h1 className="max-w-3xl font-display text-4xl leading-[1.12] tracking-tight text-foreground sm:text-5xl">
            Uma IA que cuida do dinheiro da sua casa, <span className="text-primary">enquanto vocês cuidam da vida.</span>
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            O Aval acompanha seus gastos, entende padrões e conta o que está acontecendo com o orçamento da casa antes
            de você precisar perguntar.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              to="/entrar"
              className="hero-gradient press focus-ring rounded-full px-6 py-3.5 text-sm font-bold text-primary-foreground shadow-primary"
            >
              Criar conta grátis
            </Link>
            <a
              href="#recursos"
              className="press focus-ring rounded-full border border-border px-6 py-3.5 text-sm font-bold text-foreground hover:bg-secondary"
            >
              Ver como funciona
            </a>
          </div>

          <PhoneMock />
        </section>

        {/* Recursos */}
        <section id="recursos" className="mx-auto max-w-6xl px-5 py-20">
          <Reveal className="mx-auto max-w-xl text-center">
            <h2 className="font-display text-3xl text-foreground sm:text-4xl">Tudo que a casa precisa, num só lugar</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Sem planilha, sem grupo de WhatsApp pra fechar conta. O Aval organiza e avisa por vocês.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc }, index) => (
              <Reveal key={title} delay={index * 70} className="card-surface hover-lift p-6 text-left">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary ring-1 ring-primary/15">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <h3 className="mt-4 text-base font-bold text-foreground">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Como funciona */}
        <section id="como-funciona" className="mx-auto max-w-6xl px-5 py-20">
          <Reveal className="mx-auto max-w-xl text-center">
            <h2 className="font-display text-3xl text-foreground sm:text-4xl">Como funciona</h2>
          </Reveal>
          <div className="relative mt-12 grid gap-6 sm:grid-cols-3">
            <div className="pointer-events-none absolute left-0 right-0 top-6 hidden h-px bg-linear-to-r from-transparent via-border to-transparent sm:block" />
            {STEPS.map((step, index) => (
              <Reveal
                key={step.n}
                delay={index * 90}
                className="relative flex flex-col items-center text-center sm:items-start sm:text-left"
              >
                <span className="hero-gradient relative flex h-12 w-12 items-center justify-center rounded-full font-display text-lg font-bold text-primary-foreground shadow-primary">
                  {step.n}
                </span>
                <h3 className="mt-4 text-base font-bold text-foreground">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Segurança */}
        <section id="seguranca" className="mx-auto max-w-6xl px-5 py-20">
          <Reveal className="finance-hero hero-texture relative overflow-hidden rounded-3xl p-8 sm:p-12">
            <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary ring-1 ring-primary/15">
                  <ShieldCheck className="h-6 w-6" strokeWidth={2} />
                </span>
                <h2 className="mt-5 font-display text-3xl text-foreground sm:text-4xl">Seus dados, sua casa</h2>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
                  O Aval foi pensado pra guardar informação financeira sensível com o mesmo cuidado que um banco tem com
                  a sua.
                </p>
              </div>
              <ul className="flex flex-col gap-4">
                {SECURITY_POINTS.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-sm leading-relaxed text-foreground/90">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2} />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </section>

        {/* CTA final */}
        <section className="mx-auto max-w-6xl px-5 pb-24">
          <Reveal className="card-surface flex flex-col items-center gap-5 p-10 text-center sm:p-14">
            <AvalMark size={32} />
            <h2 className="font-display text-3xl text-foreground sm:text-4xl">Comece agora, é grátis.</h2>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              Crie sua conta e traga sua casa pro Aval em poucos minutos.
            </p>
            <Link
              to="/entrar"
              className="hero-gradient press focus-ring rounded-full px-7 py-3.5 text-sm font-bold text-primary-foreground shadow-primary"
            >
              Criar conta grátis
            </Link>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <AvalMark size={22} />
            <div>
              <p className="font-display text-base text-foreground">Aval</p>
              <p className="text-xs text-muted-foreground">Assistente financeiro para a sua casa.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <Link to="/termos" className="hover:text-foreground">
              Termos de uso e privacidade
            </Link>
            <span>© {new Date().getFullYear()} Aval</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function PhoneMock() {
  const bars = [38, 52, 30, 70, 45, 60, 26];
  const days = ["S", "T", "Q", "Q", "S", "S", "D"];
  return (
    <div className="relative mt-4 w-full max-w-[300px]">
      <div className="pointer-events-none absolute -inset-x-10 -inset-y-6 -z-10 rounded-[3rem] bg-primary/10 blur-3xl" />
      <div className="panel-elevated hero-texture relative overflow-hidden rounded-[2.25rem] border border-primary/20 p-4">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold text-muted-foreground">Olá, tudo bem?</span>
          <AvalMark size={16} />
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center gap-2.5 rounded-2xl bg-secondary p-2.5 text-left">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-card text-primary">
              <Utensils className="h-4 w-4" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-bold text-foreground">Mercado</p>
              <p className="text-[10px] text-muted-foreground">Alimentação · hoje</p>
            </div>
            <p className="tnum shrink-0 text-[12px] font-bold text-foreground">R$ 186,40</p>
          </div>
          <div className="flex items-center gap-2.5 rounded-2xl bg-secondary p-2.5 text-left">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-card text-primary">
              <Home className="h-4 w-4" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-bold text-foreground">Aluguel</p>
              <p className="text-[10px] text-muted-foreground">Casa · 5 de ago.</p>
            </div>
            <p className="tnum shrink-0 text-[12px] font-bold text-foreground">R$ 1.450,00</p>
          </div>
        </div>

        <div className="panel-flat mt-3 p-3 text-left">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Gastos essa semana
            </span>
            <span className="text-[10px] font-bold text-primary">↑ 18%</span>
          </div>
          <div className="mt-2.5 flex gap-1.5">
            {bars.map((v, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-14 w-full items-end">
                  <div
                    className="w-full rounded-full bg-primary/70"
                    style={{ height: `${v}%`, background: i === 3 ? "var(--color-primary)" : undefined }}
                  />
                </div>
                <span className="text-[8px] text-muted-foreground">{days[i]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-2xl bg-primary-soft p-2.5 text-left ring-1 ring-primary/15">
          <p className="text-[11px] leading-snug text-foreground">
            <span className="font-bold text-primary">Vigia:</span> vocês já usaram 82% do orçamento de Lazer este mês.
          </p>
        </div>
      </div>
    </div>
  );
}
