# Aval

PWA de finanças domésticas: orçamento mensal, divisão de gastos entre perfis da casa, metas de prioridade e um assistente de IA com acesso às ferramentas financeiras do usuário.

---

## Índice

- [Visão Geral](#visão-geral)
- [Stack Tecnológica](#stack-tecnológica)
- [Arquitetura](#arquitetura)
- [Módulos](#módulos)
- [Banco de Dados](#banco-de-dados)
- [Autenticação e Autorização](#autenticação-e-autorização)
- [API do Backend](#api-do-backend)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Rodando o Projeto](#rodando-o-projeto)
- [Estrutura de Arquivos](#estrutura-de-arquivos)

---

## Visão Geral

O **Aval** é um app de orçamento doméstico multi-perfil: uma casa pode ter mais de uma pessoa lançando gastos, cada uma com sua própria renda/repasse, e o app calcula o orçamento disponível, o comprometido, o pago e o que falta pagar — tanto por pessoa quanto para a casa como um todo.

O produto é dividido em duas partes:

| Parte | O que faz |
|---|---|
| Frontend (PWA) | Toda a experiência do usuário — lançamento de gastos, metas, configurações, e a UI do assistente de IA. Fala direto com o Supabase para dados e auth. |
| Backend (Spring Boot) | Serve o assistente de IA (Gemini) e suas "tools" financeiras via API própria, autenticado pelo mesmo JWT do Supabase. Hoje é consumido apenas pelo Assistente — o resto do app lê/escreve direto no Supabase. |

---

## Stack Tecnológica

### Frontend

| Camada | Tecnologia |
|---|---|
| Framework | TanStack Start (React 19) + TanStack Router (rotas por arquivo) + TanStack Query |
| Linguagem | TypeScript 5 |
| Build | Vite |
| UI | Tailwind CSS v4 (tokens via `@theme inline` em `styles.css`) + Radix UI (dialog, switch, tooltip, etc.) + `lucide-react` |
| Banco de dados / Auth | Supabase (Postgres + Supabase Auth), via `@supabase/supabase-js` |
| Mobile | Capacitor (build iOS nativo a partir do mesmo código web) |
| Testes | Vitest + Testing Library (jsdom) |
| Gerenciador de pacotes | pnpm |

### Backend

| Camada | Tecnologia |
|---|---|
| Linguagem | Java 25 |
| Framework | Spring Boot (Web, Security, Validation, Actuator) |
| Acesso a dados | JDBC puro (sem JPA/Hibernate) contra o mesmo Postgres do Supabase |
| Auth | Spring Security OAuth2 Resource Server — valida o JWT do Supabase (ES256) via JWKS |
| IA | Gemini, via um provider próprio + orquestrador de "tools" (function calling) |
| Observabilidade | Actuator + Micrometer/Prometheus + OpenTelemetry (OTLP) |
| Testes | JUnit + MockMvc + Testcontainers (Postgres real em CI) |

---

## Arquitetura

```
Browser
  └── TanStack Start (rotas por arquivo em src/routes/)
        ├── /              → Gate: sem auth → LandingPage; autenticado → AppHome (shell da SPA)
        ├── /entrar         → AuthScreen (login/cadastro via Supabase Auth)
        ├── /termos         → TermsPage
        └── /api/gemini-chat → rota de servidor legada (caminho anterior ao backend Spring)

AppHome (dentro de "/", já autenticado)
  └── troca de tela é client-side (um ViewKey em memória, não rotas reais):
        Painel · Gastos · Prioridades · Aval (assistente) · Configurações

src/lib/
  ├── finance/
  │     ├── FinanceContext.tsx   ← fonte única de verdade: estado, leitura/escrita no Supabase, fila de sync offline
  │     └── calc.ts              ← toda a lógica financeira pura (orçamento, categorias, rollover de mês, etc.)
  ├── supabase/                  ← client Supabase (browser)
  └── api/backendClient.ts       ← client autenticado para o backend Spring (usado pelo Assistente)

backend/ (Spring Boot, deploy separado)
  └── com.aval.*
        ├── platform   → health, /me, config de segurança (JWT)
        ├── finance    → domínio financeiro (Money, FinancialEntry, FinancialMonth, Priority) + repositórios JDBC
        ├── household  → perfis financeiros e associação usuário↔casa
        └── assistant  → orquestração do Gemini + tools (get_expenses, get_goals, simulate_purchase, ...)
```

**Onde cada coisa mora:** a lógica de orçamento (`calc.ts`) e o estado da aplicação (`FinanceContext.tsx`) vivem inteiramente no frontend, que fala direto com o Supabase. O backend Spring não participa dessas operações — ele existe para dar ao Assistente de IA um jeito seguro e testável de consultar/simular dados financeiros via "tools", sem expor a chave do Gemini no cliente.

---

## Módulos

### Painel (`DashboardView`)
Visão geral do mês: saldo livre, ações rápidas (adicionar gasto, simular compra), resumo financeiro (disponível/comprometido/pago/falta pagar), divisão da casa por perfil, comparação com os próximos meses e a categoria que mais pesa no orçamento.

### Gastos (`TransactionsView`)
Lista e gerenciamento dos lançamentos do mês — criar, editar, filtrar por categoria, ver quem é o responsável por cada gasto.

### Prioridades (`PrioritiesView`)
Metas de prioridade (o que vale a pena priorizar no orçamento) — criação e acompanhamento.

### Aval — Assistente (`AssistantView`)
Chat com IA (Gemini) que tem acesso a "tools" reais do usuário via o backend Spring: extrato de gastos, metas, perfis da casa, comparação entre meses, simulação de compra parcelada e simulação de poupança — nunca inventa números, consulta os dados de verdade.

### Configurações (`SettingsView`)
Conta, membros da casa (convidar/entrar em outra casa), perfis financeiros, categorias, mês ativo, importação de extrato bancário, notificações push, backup/exportação e consentimento de IA.

### Autenticação (`AuthScreen`) e Landing (`LandingPage`)
Login/cadastro via Supabase Auth (`/entrar`) e página institucional pública (`/`) para quem ainda não está autenticado.

**Diálogos existentes** (`dialogs.tsx`, `AccountDialogs.tsx`): gasto, prioridade, mês, pessoas/perfis, categorias, convite para a casa, entrar em outra casa, notificações push, importação de extrato bancário, vigias (regras de alerta), simulador de compra, envelopes, conta, senha, dados pessoais, segurança, membros.

---

## Banco de Dados

Postgres via Supabase, schema `public`, migrado incrementalmente em `supabase/migrations/`. Tabelas principais:

| Tabela | Descrição |
|---|---|
| `app_users` | Usuários da aplicação |
| `households` | Casas (unidade de multi-tenant) |
| `household_members` | Associação usuário ↔ casa, com convites |
| `financial_profiles` | Perfis financeiros dentro de uma casa (uma pessoa pode ter mais de um) |
| `finance_months` | Um mês financeiro por casa (renda, repasse, versão para concorrência otimista) |
| `profile_budgets` | Orçamento por perfil dentro de um mês |
| `expenses` | Gastos — categoria, valor, status, responsável, vínculo opcional com extrato bancário importado |
| `priorities` | Metas de prioridade |
| `envelopes` | Categorias/envelopes de orçamento |
| `settlements` | Acertos entre perfis da casa |
| `household_invites` | Convites pendentes para entrar em uma casa |
| `push_subscriptions` | Inscrições de notificação push |
| `ai_rate_limit_events` | Controle de limite de uso do Assistente de IA |
| `ai_consents` | Consentimento do usuário para o Assistente de IA |

O backend Spring não usa JPA — acessa as mesmas tabelas via JDBC puro (`Jdbc*Repository`), com Flyway presente mas desligado contra o banco real (só roda contra um Postgres descartável do Testcontainers em teste).

> Multi-tenant é por **casa** (household), não por organização — cada casa vê só seus próprios perfis, meses e gastos.

---

## Autenticação e Autorização

```
1. /entrar → Supabase Auth valida e-mail/senha
2. Sessão fica no client Supabase (cookies/local storage)
3. FinanceContext carrega o estado da casa do usuário logado
4. Ao chamar o backend Spring (Assistente), o token do Supabase
   vai como Authorization: Bearer <jwt>
5. O backend valida o JWT contra o JWKS do Supabase (algoritmo
   ES256, issuer e audience conferidos) — sem essa validação,
   toda rota (exceto /health) retorna 401
```

A separação de dados entre casas é garantida no nível de dados (Row-Level Security do Supabase) e, do lado do backend, por `HouseholdAccessService`, que resolve o(s) perfil(is) financeiro(s) do usuário autenticado antes de qualquer consulta.

---

## API do Backend

Consumida hoje pelo Assistente de IA (`src/lib/api/backendClient.ts`), via `VITE_API_BASE_URL`. Todas as rotas (exceto `/health`) exigem `Authorization: Bearer <jwt do Supabase>`.

| Rota | Método | Descrição |
|---|---|---|
| `/api/v1/health` | GET | Health check público |
| `/api/v1/me` | GET | Diagnóstico de autenticação — quem é o usuário do token |
| `/api/v1/assistant/messages` | POST | Envia uma mensagem ao Assistente (orquestra o Gemini + tools) |
| `/api/v1/financial-summary` | GET | Resumo financeiro do usuário |
| `/api/v1/tools/financial-summary` | GET | Tool: resumo financeiro (também chamável pelo Assistente) |
| `/api/v1/tools/expenses` | GET | Tool: lista de gastos |
| `/api/v1/tools/goals` | GET | Tool: metas de prioridade |
| `/api/v1/tools/household-profiles` | GET | Tool: perfis da casa |
| `/api/v1/tools/compare-months` | GET | Tool: comparação entre meses |
| `/api/v1/tools/simulate-purchase` | POST | Tool: simulação de compra parcelada |
| `/api/v1/tools/simulate-savings` | POST | Tool: simulação de poupança |

Cada "tool" existe tanto como endpoint REST próprio quanto como função que o orquestrador do Assistente pode chamar durante uma conversa — o mesmo código, dois pontos de entrada.

---

## Variáveis de Ambiente

### Frontend (`.env.local`)

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
VITE_API_BASE_URL=http://localhost:8081
VITE_VAPID_PUBLIC_KEY=...   # notificações push
```

### Backend (`backend/.env`)

```env
DATABASE_URL=jdbc:postgresql://localhost:5432/postgres
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=

SUPABASE_JWT_ISSUER=https://SEU_PROJETO.supabase.co/auth/v1
SUPABASE_JWKS_URL=https://SEU_PROJETO.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_JWT_AUDIENCE=authenticated

CORS_ALLOWED_ORIGINS=http://localhost:8080

GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
GEMINI_TIMEOUT_MS=15000

SERVER_PORT=8081
```

> `.env*` está no `.gitignore` — nunca commite credenciais.

---

## Rodando o Projeto

### Frontend

```bash
pnpm install
pnpm dev        # http://localhost:8080
pnpm test       # vitest run
pnpm lint
pnpm build
```

### Backend

```bash
cd backend
cp .env.example .env
./mvnw spring-boot:run -Dspring-boot.run.profiles=local   # http://localhost:8081
./mvnw test      # unitários + MockMvc
./mvnw verify     # + integração com Testcontainers (precisa de Docker)
```

`backend/docker-compose.yml` sobe um Postgres descartável para dev local (não é o Supabase real) e o próprio backend apontado para ele — útil para testar sem tocar nos dados de produção.

---

## Estrutura de Arquivos

```
assistente-fin/
├── src/
│   ├── routes/                    # rotas TanStack Start (por arquivo)
│   │   ├── index.tsx              # "/" — Gate: landing ou AppHome
│   │   ├── entrar.tsx             # "/entrar" — login
│   │   ├── termos.tsx             # "/termos"
│   │   ├── __root.tsx             # layout raiz (QueryClient, Toaster, 404)
│   │   └── api/gemini-chat.ts     # rota de servidor legada
│   ├── components/app/
│   │   ├── AppHome.tsx            # shell autenticado + troca de view (ViewKey)
│   │   ├── DashboardView.tsx      # Painel
│   │   ├── TransactionsView.tsx   # Gastos
│   │   ├── PrioritiesView.tsx     # Prioridades
│   │   ├── AssistantView.tsx      # Aval (chat de IA)
│   │   ├── SettingsView.tsx       # Configurações
│   │   ├── LandingPage.tsx / AuthScreen.tsx / TermsPage.tsx
│   │   ├── AccountDialogs.tsx     # conta, senha, dados pessoais, segurança, membros
│   │   ├── dialogs.tsx            # gasto, prioridade, mês, pessoas, categorias, convite, ...
│   │   ├── BottomNav.tsx / SideNav.tsx
│   │   └── charts/                # gráficos usados no Painel
│   ├── lib/
│   │   ├── finance/
│   │   │   ├── FinanceContext.tsx # estado global, leitura/escrita Supabase, fila offline
│   │   │   └── calc.ts            # orçamento, categorias, rollover de mês, etc.
│   │   ├── supabase/               # client Supabase
│   │   └── api/backendClient.ts    # client do backend Spring
│   └── styles.css                  # tokens de design (Tailwind v4 @theme inline)
├── supabase/migrations/            # evolução do schema Postgres
├── backend/                         # API Spring Boot (deploy separado)
│   ├── src/main/java/com/aval/
│   │   ├── platform/                # health, /me, security config
│   │   ├── finance/                 # domínio financeiro + repositórios JDBC
│   │   ├── household/               # perfis e associação usuário↔casa
│   │   └── assistant/                # orquestração Gemini + tools
│   ├── src/test/                     # JUnit + MockMvc + Testcontainers
│   └── docker-compose.yml            # Postgres descartável para dev local
├── ios/ native/                      # build nativo via Capacitor
└── vitest.config.ts
```
