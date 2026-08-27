# ADR-004 — Tenant/household authorization strategy

**Status:** Accepted (strategy) — implementation deferred to P2-FINANCIAL-DOMAIN

## Context

Every financial query is scoped to a household. `GET /expenses?householdId=123`
must never trust `123` at face value — the server must independently verify
the caller actually belongs to that household.

Before deciding, this ADR inspected the **real, existing** enforcement
mechanism (read-only query against the production Supabase project, not
assumed from general Supabase knowledge):

```sql
-- pg_policies for expenses/finance_months/financial_profiles:
--   qual = with_check = "is_household_member(household_id)"

-- is_household_member(target_household_id):
select exists (
  select 1 from public.household_members
  where household_id = target_household_id and user_id = auth.uid()
);
```

So today, 100% of tenancy enforcement is Postgres Row-Level Security,
driven by `auth.uid()` — which Supabase's own client library and PostgREST
populate per-request from the caller's JWT via a Postgres session-local
setting. This is the mechanism the PWA already depends on entirely.

## Options considered

- **A. Direct PostgreSQL, tenancy enforced in the backend.** Spring
  connects straight to Postgres (JDBC/future JPA) and explicitly checks
  membership on every query.
- **B. Supabase API/PostgREST with the user's own JWT.** Spring forwards
  the validated JWT to PostgREST, letting the existing RLS policies do the
  enforcement automatically, exactly as the PWA does today.
- **C. A controlled combination.**

## Decision

**Option A, but built to reuse the database's existing, audited membership
logic rather than reimplement it from scratch in Java, and never by
silently trusting a client-supplied household id.**

Concretely, for P2 (no query exists yet in P1 to apply this to):

- The backend's Postgres connection uses an elevated (service-role-style)
  credential — the same category of credential the PWA's own server routes
  (`gemini-chat.ts`, `send-reminders.ts`) already use for privileged
  server-side access — **not** the anon/publishable key.
- Because that connection does not go through PostgREST, it does not
  automatically get Supabase's per-request `auth.uid()` session context.
  Relying on RLS alone here without replicating that mechanism correctly
  would either silently deny everything (if `auth.uid()` evaluates null) or
  require fragile plumbing to fake it — an explicit foot-gun this ADR
  rejects.
- Every household-scoped query will instead call the **same, existing**
  `is_household_member(household_id)` / `is_household_admin(household_id)`
  SQL functions explicitly, passing the household id from the request and
  the user id from the validated JWT (`AuthenticatedUser.id()`) as
  parameters — reusing the one already-correct, already-audited source of
  truth instead of hand-rolling a second copy of "does this user belong to
  this household" in application code that could drift from it.
- `household_id` never comes from a request parameter alone without this
  check; it is always paired with the caller's own validated identity.

### Why not B

PostgREST would work, and would reuse RLS "for free" — but it adds an HTTP
hop for every query the Spring backend needs, doesn't fit well with the
JDBC-based approach ADR-002 already chose, and makes it harder to build
the richer, custom queries the Financial Tools/Simulation Engine phases
will eventually need (aggregations across months/profiles, for example).

## Consequences

- P2-FINANCIAL-DOMAIN's first real repository/query is where this
  enforcement actually gets implemented and tested — this ADR is the
  contract that implementation must satisfy, not a claim that it exists
  yet.
- If a future query pattern turns out to be awkward under this model,
  revisit — this ADR is not a permanent lock-in, just today's evidenced,
  documented default.
