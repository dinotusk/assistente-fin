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
        <section className="relative mx-auto grid min-h-[calc(100dvh-4rem)] max-w-6xl items-center gap-12 overflow-hidden px-5 pb-20 pt-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-8 lg:pb-16 lg:pt-16">
          <div className="relative z-10 flex flex-col items-center text-center lg:items-start lg:text-left">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Assistente financeiro para a sua casa
            </span>
            <h1 className="mt-7 max-w-3xl font-display text-[3.35rem] leading-[0.98] tracking-tight text-foreground sm:text-6xl lg:text-[4.75rem]">
              Uma IA que cuida do dinheiro da sua casa, <span className="text-primary">enquanto vocês cuidam da vida.</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-relaxed text-foreground/82 sm:text-lg">
              O Aval acompanha seus gastos, entende padrões e conta o que está acontecendo com o orçamento da casa antes
              de você precisar perguntar.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/entrar"
                className="hero-gradient press focus-ring rounded-full px-7 py-4 text-sm font-bold text-primary-foreground shadow-primary"
              >
                Criar conta grátis
              </Link>
              <a
                href="#recursos"
                className="press focus-ring rounded-full border border-border px-7 py-4 text-sm font-bold text-foreground hover:bg-secondary"
              >
                Ver como funciona
              </a>
            </div>
            <div className="mt-9 flex flex-wrap justify-center gap-4 text-[11px] text-foreground/68 lg:justify-start">
              <span>◉ Dados protegidos</span>
              <span>◇ Feito para sua rotina</span>
              <span>✦ IA com contexto</span>
            </div>
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
  const bars = [18, 62, 42, 22, 30, 24, 18];
  const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const transactions = [
    { icon: Utensils, title: "Café e padaria", meta: "Alimentação · Hoje", value: "R$ 18,50" },
    { icon: Bell, title: "Assinatura mensal", meta: "Serviços · Ontem", value: "R$ 39,90" },
    { icon: Home, title: "Aluguel", meta: "Moradia · em 3 dias", value: "R$ 1.450,00" },
  ];

  return (
    <div className="relative mx-auto h-[560px] w-full max-w-[720px] lg:h-[600px]">
      <div className="pointer-events-none absolute inset-6 rounded-full bg-primary/10 blur-3xl" />

      <div className="absolute left-[-10px] top-[118px] hidden w-[270px] rotate-[-5deg] sm:block lg:left-[-20px]">
        <article className="animate-float rounded-[1.6rem] border border-primary/18 bg-card/72 p-5 text-left shadow-float backdrop-blur-xl">
          <p className="text-[11px] font-bold text-muted-foreground">Últimas movimentações</p>
          <div className="mt-3 flex flex-col divide-y divide-border/70">
            {transactions.map(({ icon: Icon, title, meta, value }) => (
              <div key={title} className="grid grid-cols-[34px_1fr] gap-3 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Icon className="h-4 w-4" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-[12px] font-bold text-foreground">{title}</p>
                    <span className="tnum text-[10px] font-bold text-foreground/80">{value}</span>
                  </div>
                  <p className="truncate text-[10px] text-muted-foreground">{meta}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="absolute bottom-6 right-[-8px] hidden w-[300px] rotate-[5deg] sm:block lg:right-[-22px]">
        <article
          className="animate-float rounded-[1.7rem] border border-primary/18 bg-card/70 p-5 text-left shadow-float backdrop-blur-xl"
          style={{ animationDelay: "-3.5s" }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-muted-foreground">Resumo da semana</p>
            <span className="text-[11px] font-bold text-success">↗ 6%</span>
          </div>
          <strong className="tnum mt-3 block font-display text-3xl text-foreground">R$ 1.280,00</strong>
          <div className="mt-5 flex h-24 items-end gap-2">
            {bars.map((height, index) => (
              <div key={days[index]} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-16 w-full items-end">
                  <div
                    className={cn("w-full rounded-full bg-success/55", index === 1 && "bg-primary")}
                    style={{ height: `${height}%` }}
                  />
                </div>
                <span className="text-[8px] text-muted-foreground">{days[index]}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-border pt-3 text-[10px] text-muted-foreground">
            A Aval encontrou 3 ajustes
          </p>
        </article>
      </div>

      <div className="absolute left-1/2 top-4 z-10 h-[536px] w-[316px] -translate-x-1/2 sm:w-[334px] lg:left-[53%] lg:h-[580px] lg:w-[348px]">
        <div className="absolute -left-1 top-24 h-16 w-1 rounded-l-full bg-primary/35" />
        <div className="absolute -left-1 top-48 h-12 w-1 rounded-l-full bg-primary/30" />
        <div className="absolute -right-1 top-36 h-20 w-1 rounded-r-full bg-primary/35" />
        <article className="animate-float h-full w-full rounded-[3.05rem] bg-linear-to-br from-[#e6d3a5]/75 via-[#5b4a2c]/45 to-[#0c2018] p-[3px] shadow-float">
          <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[2.85rem] border border-white/8 bg-[#0b2a20]/96 p-5 text-left backdrop-blur-xl">
            <div className="absolute left-1/2 top-3 z-20 h-7 w-[92px] -translate-x-1/2 rounded-full bg-black shadow-[inset_0_1px_2px_rgb(255_255_255/0.08)]" />
            <div className="pointer-events-none absolute inset-[7px] rounded-[2.45rem] ring-1 ring-white/7" />
            <div className="mt-10 flex items-center justify-between">
              <AvalMark size={34} />
              <Sparkles className="h-4 w-4 text-primary" />
            </div>

            <div className="mt-8">
              <p className="text-sm text-muted-foreground">Olá, Junior</p>
              <h2 className="mt-2 max-w-[230px] font-display text-[2rem] leading-[0.98] text-foreground">
                O que vamos organizar hoje?
              </h2>
            </div>

            <div className="no-scrollbar mt-6 flex gap-2 overflow-x-auto">
              <button className="focus-ring shrink-0 rounded-full border border-primary bg-primary-soft px-3 py-2 text-[10px] font-bold text-primary">
                Como está meu mês?
              </button>
              <button className="focus-ring shrink-0 rounded-full border border-border px-3 py-2 text-[10px] font-bold text-muted-foreground">
                Onde posso economizar?
              </button>
              <button className="focus-ring shrink-0 rounded-full border border-border px-3 py-2 text-[10px] font-bold text-muted-foreground">
                Ver próximos vencimentos
              </button>
            </div>

            <div className="mt-4 rounded-[1.25rem] bg-foreground p-4 text-background shadow-soft">
              <p className="font-display text-lg leading-snug">Seu orçamento está R$ 70 acima do previsto.</p>
            </div>

            <div className="mt-auto rounded-[1.2rem] border border-border bg-background/45 p-3">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-[12px] font-medium text-muted-foreground">Pergunte à Aval</span>
                <button
                  type="button"
                  aria-label="Enviar pergunta"
                  className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"
                >
                  ↑
                </button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
