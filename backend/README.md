# Aval backend (V1 foundation)

> **Este backend ainda não substitui o domínio financeiro do PWA.** Ele não
> tem nenhum endpoint financeiro, não calcula nada, e o frontend não o
> consome ainda. Esta rodada (P1-SPRING-BOOT-FOUNDATION) entrega só a
> fundação: autenticação, erros, observabilidade, e o esqueleto modular
> onde o domínio real será construído em P2-FINANCIAL-DOMAIN.

## Pré-requisitos

- **Java 25** (LTS). Não precisa instalar Maven — use o wrapper (`./mvnw`).
- Um PostgreSQL alcançável para rodar de verdade (local, Docker, ou o
  Supabase real via `.env`) — não é necessário para compilar/testar
  unitariamente.
- **Docker**, apenas para os testes de integração (Testcontainers) e para
  `docker build`/`docker compose`.

## Executar localmente

```bash
cd backend
cp .env.example .env   # preencha os valores reais localmente; nunca commite .env
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

Sobe em `http://localhost:8081` (ou o valor de `SERVER_PORT`). Sem
`DATABASE_URL`/Supabase configurados, o app ainda sobe — só `/api/v1/health`
funciona de verdade sem depender de banco; `/api/v1/me` rejeita qualquer
token (não há bypass).

## Testes

```bash
./mvnw test              # unitários + testes de contexto/segurança via MockMvc
./mvnw verify             # inclui os testes de integração com Testcontainers
```

Os testes de integração (`com.aval.integration.*`) exigem Docker. Se Docker
não estiver disponível, eles falham na criação do container — isso é
diferente de uma regressão real no código; veja a seção "Testcontainers"
abaixo antes de interpretar essa falha.

## Docker

```bash
docker build -t aval-backend .
docker compose up --build   # backend + Postgres local descartável
```

A imagem final não contém Maven, código-fonte, nem nenhum segredo — só o
JRE e o jar. Roda como usuário não-root. Healthcheck via
`GET /api/v1/health`.

## Arquitetura

Monólito modular (ver `docs/architecture/ADR-001-modular-monolith.md`):

```
com.aval
├── household        (boundary — vazio nesta rodada)
├── finance           (boundary — vazio nesta rodada)
│   ├── expenses, income, budgets, goals, simulations
├── assistant         (boundary — vazio nesta rodada)
│   ├── tools, orchestration, turns, richblocks
├── openfinance        (boundary — vazio nesta rodada)
│   ├── provider, ingestion, normalization, reconciliation
└── platform           (implementado nesta rodada)
    ├── auth           — AuthenticatedUser, derivado do JWT validado
    ├── config          — SecurityConfig, OpenApiConfig, AvalProperties
    ├── errors          — contrato de erro único, GlobalExceptionHandler
    ├── jobs            — boundary — vazio nesta rodada
    └── web             — RequestIdFilter, RequestLoggingFilter, HealthController, MeController
```

Módulos de negócio existem só como `package-info.java` — sem classes vazias
"para parecer arquitetura enterprise". Veja cada `package-info.java` para o
que está planejado ali.

## Profiles

- `local` — Swagger UI habilitado, Actuator mais aberto (health/info/
  prometheus/metrics), logs DEBUG em `com.aval`.
- `test` — usado pelos testes de integração; Flyway habilitado **só**
  contra o container Testcontainers descartável.
- `production` — Swagger/OpenAPI desabilitados, Actuator só expõe `health`.
- Sem profile ativo — usa `application.yml` (base): Flyway desabilitado,
  Swagger habilitado, Actuator só `health`.

## Auth

Ver `docs/architecture/ADR-003-supabase-auth-jwt.md`. Resumo: o frontend
continua autenticando 100% pelo Supabase Auth; o Spring só valida o JWT já
emitido (assinatura via JWKS, issuer, expiração, audience) como um OAuth2
Resource Server padrão. Nenhuma senha chega ao Spring; nenhum sistema de
login paralelo; identidade sempre vem do token validado, nunca de um campo
enviado pelo cliente.

Endpoint de diagnóstico protegido: `GET /api/v1/me`.

## Banco de dados

Mesmo PostgreSQL/Supabase que o PWA já usa — nenhum banco novo. Flyway está
configurado mas **desabilitado por padrão** contra o schema real: ver
`src/main/resources/db/migration/README.md` para o procedimento de baseline
necessário antes de habilitar isso contra um ambiente real. Testes de
integração usam Flyway de verdade, mas só contra um container Postgres
descartável (nunca o banco real) — ver
`src/test/resources/db/migration/V1__init.sql`.

## Tenancy / autorização por household

Ver `docs/architecture/ADR-004-tenant-household-authorization.md`. Decisão
já tomada e documentada, mas a implementação real (reutilizar as funções
SQL `is_household_member`/`is_household_admin` já existentes e auditadas no
banco) só acontece em P2-FINANCIAL-DOMAIN, quando existir a primeira query
real para aplicá-la.

## Testcontainers

`com.aval.integration.PostgresIntegrationTest` sobe um Postgres real via
Testcontainers (nunca o Supabase de produção) e prova: contexto Spring,
conexão JDBC, e a configuração do Flyway (rodando uma migration só de
teste). Requer Docker. Se este ambiente não tiver Docker disponível, a
falha aparece na criação do container, não como uma falha de asserção —
não trate isso como "o código está quebrado" sem antes confirmar que Docker
está disponível.

## Decisões de segurança

- CORS: lista explícita de origens (`CORS_ALLOWED_ORIGINS`), nunca `*` junto
  com credenciais.
- Sessão stateless, CSRF desabilitado (API sem cookie/sessão — não há
  superfície de CSRF a proteger).
- Headers de segurança padrão do Spring Security (HSTS em HTTPS,
  `X-Content-Type-Options: nosniff`, frame options) permanecem ativos —
  nada aqui os desabilita.
- Actuator expõe só `health` fora do profile `local`.
- Swagger/OpenAPI desabilitados em produção.
- Nenhum log contém senha, JWT, API key, ou descrição completa de gasto —
  ver `RequestLoggingFilter` (loga só método/rota/status/duração/userId).

## O que ainda NÃO foi migrado

- Nenhuma regra financeira (`calc.ts` continua sendo a única fonte de
  verdade matemática — ver P0-FINANCIAL-TRUTH).
- Nenhum endpoint de negócio (`/expenses`, `/goals`, `/financial-summary`,
  `/simulations`) — entram em P2.
- IA/Gemini, Open Finance, Expo — fora de escopo até as fases
  correspondentes do roadmap.
- O frontend não chama este backend ainda.
