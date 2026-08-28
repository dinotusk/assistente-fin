# Backend staging — AVAL V1 (P6)

Companion to ADR-002 (Spring Boot + Supabase), ADR-003 (JWT auth), ADR-004 (tenancy). This
document is deliberately **not** an ADR — it records a temporary infrastructure choice (Railway),
not an architectural decision the application code depends on. No line of `backend/` knows or
cares that it runs on Railway; every setting described here is external configuration.

## Why Railway, and why it's temporary

Google Cloud Run was the original P6 target (see the P6 GCP discovery/planning history in this
repo's session logs). It was deferred because the GCP project (`aval-504514`) has
`billingEnabled=false` and enabling billing requires a decision outside this task's scope. Railway
was chosen as a **substitute staging host only**, explicitly not meant to become a permanent
dependency — see "Portability to Cloud Run" below for what that promise actually rests on.

## Current deployment

| | |
|---|---|
| Provider | Railway |
| Project | `aval backend` |
| Service | `aval-backend-staging` |
| Repo | `dinotusk/assistente-fin` |
| Branch | `develop/aval-v1` (exclusive — `main` is never connected to this service) |
| Root Directory | `/backend` |
| Builder | Dockerfile (`backend/Dockerfile`, unmodified — same image Cloud Run would use) |
| Container port | `8081` (via the `PORT` service variable — see "Port strategy" below) |
| Healthcheck | `GET /api/v1/health`, expects `200` — same endpoint used for local/Docker healthchecks, deliberately DB-independent |
| Spring profiles | `production,staging` (`SPRING_PROFILES_ACTIVE`) |

## Port strategy — config-only, no Railway-specific code

Railway injects its own `PORT` env var and uses it for both traffic routing and the healthcheck.
Rather than making the app listen on whatever Railway picks, a **fixed** `PORT=8081` service
variable was set — this exploits the fact that `backend/Dockerfile` already hardcodes
`EXPOSE 8081`/`ENV SERVER_PORT=8081`, and Spring already reads `server.port: ${SERVER_PORT:8081}`.
Zero application/Dockerfile changes were needed. Cloud Run, when this migrates back, sets its own
port entirely through its own service config (`--port`), independent of anything set here.

## Env vars (names only — no values here or anywhere in Git)

Public (plain service variables):
```
SPRING_PROFILES_ACTIVE
SUPABASE_JWT_ISSUER
SUPABASE_JWKS_URL
SUPABASE_JWT_AUDIENCE
CORS_ALLOWED_ORIGINS
MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE
GEMINI_MODEL
PORT
```

Secrets (Railway service variables, values entered manually by a human directly in the Railway
dashboard — never by an AI agent, never committed):
```
DATABASE_URL
DATABASE_USERNAME
DATABASE_PASSWORD
GEMINI_API_KEY
```

`GEMINI_API_KEY` is the canonical name read by `AvalProperties`/`GeminiLlmProvider`
(`application.yml`'s `aval.gemini.api-key: ${GEMINI_API_KEY:${GEMINI_API:}}` — `GEMINI_API` is a
legacy fallback, not used here, to avoid ambiguity).

## Supabase connection strategy

Same Supabase/PostgreSQL project the PWA already uses (see ADR-002) — no new database, no schema
change, nothing altered in Supabase for this staging deployment.

`DATABASE_URL` must point at the **Supavisor Session Pooler, port 5432** (not the 6543 transaction
pooler, not the direct `db.<ref>.supabase.co` connection). As of Supabase's Feb 2025 change, port
5432 on the shared pooler is Session Mode — the right fit for a long-lived Hikari pool, and
IPv4-friendly without needing the paid IPv4 add-on the direct connection would require.
`DATABASE_USERNAME` uses the pooler's required format (`postgres.<project_ref>`), not the bare
`postgres` username the direct connection accepts.

### Hikari sizing — `backend/src/main/resources/application-staging.yml`

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 3
      minimum-idle: 1
      connection-timeout: 10000
      idle-timeout: 300000
      max-lifetime: 1700000
```

Sized for **this staging deployment specifically** — Railway runs a single replica by default
(no horizontal scaling configured), so the ceiling is `1 instance × maximum-pool-size(3) = 3`
concurrent connections against the pooler. Explicitly not a production sizing decision — see the
comment already in that file.

## CORS

`CORS_ALLOWED_ORIGINS=https://aval-v1.vercel.app` — only that origin. No `*`, no V0 domain
(`lovable-version.vercel.app`), no `localhost`, matching the same posture already enforced in
`SecurityConfig` (explicit origin list, never `*` with credentials).

## Security posture — unchanged from the rest of the backend

Nothing about running on Railway changes the security model documented in ADR-003/ADR-004 and
`backend/README.md`: `/api/v1/health` is the only public route; every other route requires a valid
Supabase JWT validated against the real JWKS endpoint; tenancy is resolved server-side from the
JWT's `sub` claim, never a client-supplied id; no secret (DB password, Gemini key) is ever visible
to the frontend or logged (`RequestLoggingFilter` logs method/route/status/duration/userId only).

## Railway domain

Generated on demand (Settings → Networking → Public Networking → Generate Domain) as
`*.up.railway.app` — not a custom domain. Not connected to the frontend yet; that's a deliberate,
separate future step (updating whatever env var the V1 frontend uses for its backend base URL),
not done as part of this staging setup.

## Deploy procedure (for anyone reconstructing this)

1. Push the target commit to `develop/aval-v1` on `dinotusk/assistente-fin`.
2. Railway auto-deploys (GitHub integration triggers on push to the connected branch only).
3. Or manually: `railway service redeploy --service aval-backend-staging` (reuses the last build
   config) — avoid `railway service source connect` to force a rebuild; it was found, empirically,
   to reset the service's builder/Root Directory settings back to Railway's Railpack default,
   which is not what this service wants.

## Rollback

Railway keeps deployment history per service (subject to the plan's image retention window).
Rollback re-deploys a previous deployment's original build. `railway down` removes the most recent
deployment and reverts the service to its previous one — used once already during this setup to
recover from a bad build.

## Portability — Railway → Google Cloud Run, later

Nothing in `backend/` is Railway-specific. The only Railway-specific artifact is the fixed `PORT`
service variable (Port strategy, above) — a deploy-time setting, not code. Migrating back to Cloud
Run means: recreate the service there with the same `backend/Dockerfile`, the same env var names
(trading `PORT` for Cloud Run's own `--port`/container port config, and recreating the four secrets
in Secret Manager instead of Railway's variable store) — zero application rewrite.
