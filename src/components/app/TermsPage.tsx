import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { AvalMark } from "./ui";

const SECTIONS = [
  {
    title: "1. Partes",
    body: [
      "Este documento regula o uso do Aval, assistente financeiro para uso doméstico e pessoal, por você, usuário cadastrado.",
      "Ao criar uma conta ou usar o Aval, você concorda com estes termos. Se não concordar, não utilize o serviço.",
    ],
  },
  {
    title: "2. Definições",
    body: [
      "\"Aval\" é o aplicativo e os serviços associados de organização financeira, incluindo o assistente conversacional.",
      "\"Casa\" ou \"perfil financeiro\" é o conjunto de dados, pessoas e lançamentos que você organiza dentro da sua conta.",
      "\"Você\" é a pessoa que cria a conta e utiliza o Aval para registrar e acompanhar gastos.",
    ],
  },
  {
    title: "3. Serviços oferecidos",
    body: [
      "O Aval permite registrar receitas e despesas, organizar por categoria e por pessoa, definir prioridades do mês, importar extratos bancários (OFX/CSV) e conversar com um assistente que resume e explica seus dados.",
      "O Aval é uma ferramenta de organização pessoal. Ele não é uma instituição financeira, não movimenta dinheiro, não processa pagamentos e não tem acesso às suas contas bancárias reais — os dados são inseridos ou importados por você.",
    ],
  },
  {
    title: "4. Cadastro na plataforma",
    body: [
      "O cadastro exige nome, e-mail e senha. Você é responsável por manter essas informações atualizadas e por proteger o acesso à sua conta.",
      "Você pode convidar outras pessoas da sua casa para compartilhar o mesmo perfil financeiro; a responsabilidade pelos dados inseridos por convidados é compartilhada entre quem administra a conta.",
    ],
  },
  {
    title: "5. Uso de inteligência artificial",
    body: [
      "O assistente do Aval usa modelos de IA para interpretar suas mensagens e gerar respostas e resumos sobre seus dados financeiros.",
      "As respostas do assistente são geradas automaticamente e podem conter imprecisões. Elas não constituem aconselhamento financeiro, contábil, jurídico ou de investimento — decisões financeiras são sempre suas.",
      "Trechos do texto que você envia ao assistente podem ser processados por um provedor de IA de terceiros para gerar a resposta. Valores monetários não são usados para treinar modelos de terceiros além do necessário para responder à sua pergunta.",
    ],
  },
  {
    title: "6. Dados e privacidade",
    body: [
      "Seus dados financeiros ficam armazenados em um banco de dados protegido por regras de acesso por usuário: só você e quem você convidar para sua casa podem ver essas informações.",
      "Não vendemos seus dados a terceiros e não exibimos anúncios dentro do Aval.",
      "Você pode exportar um backup completo dos seus dados em formato JSON a qualquer momento, pela tela de Configurações.",
      "Você pode solicitar a exclusão da sua conta e dos dados associados a qualquer momento entrando em contato pelo e-mail informado na seção 9.",
    ],
  },
  {
    title: "7. Responsabilidades do usuário",
    body: [
      "Você é responsável pela exatidão dos valores, categorias e datas que registra ou importa no Aval.",
      "O Aval depende de dados fornecidos por você; relatórios, gráficos e avisos gerados pelo assistente refletem apenas o que foi informado, e não a totalidade real das suas finanças caso haja lançamentos não registrados.",
    ],
  },
  {
    title: "8. Isenção de garantias e responsabilidade",
    body: [
      "O Aval é oferecido \"como está\", sem garantias de disponibilidade ininterrupta ou de ausência total de erros.",
      "Não nos responsabilizamos por decisões financeiras tomadas com base em informações ou sugestões do assistente. Use o bom senso e, para decisões importantes, consulte um profissional qualificado.",
    ],
  },
  {
    title: "9. Alterações e contato",
    body: [
      "Estes termos podem ser atualizados conforme o Aval evolui. Mudanças relevantes serão comunicadas dentro do aplicativo.",
      "Dúvidas, pedidos de exclusão de conta ou de dados podem ser enviados para o e-mail de suporte informado no aplicativo.",
    ],
  },
];

export function TermsPage() {
  return (
    <div className="app-backdrop min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2">
            <AvalMark size={24} />
            <span className="font-display text-lg text-foreground">Aval</span>
          </Link>
          <Link
            to="/"
            className="press focus-ring inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-14">
        <h1 className="font-display text-3xl text-foreground sm:text-4xl">Termos de uso e privacidade</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Última atualização: agosto de 2026. Este documento explica como o Aval funciona, o que fazemos com seus dados
          e quais são as responsabilidades de cada parte.
        </p>

        <div className="mt-10 flex flex-col gap-8">
          {SECTIONS.map((section) => (
            <section key={section.title} className="card-surface p-6">
              <h2 className="font-display text-xl text-foreground">{section.title}</h2>
              <div className="mt-3 flex flex-col gap-2.5">
                {section.body.map((paragraph, i) => (
                  <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
