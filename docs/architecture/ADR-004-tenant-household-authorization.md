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

## Addendum (P2-FINANCIAL-DOMAIN) — the named functions are not callable as written

When P2 actually implemented this, inspecting the real function signature
in production (not assumed) surfaced a contradiction in the "Concretely"
section above:

```sql
-- confirmed live against the production project:
is_household_member(target_household_id uuid)   -- ONE parameter
is_household_admin(target_household_id uuid)    -- ONE parameter
```

Both are `security definer` and read `auth.uid()` **internally** — neither
accepts a `user_id` parameter. There is no two-argument overload anywhere
in the migration history. So "passing the household id... and the user id
from the validated JWT... as parameters" (this ADR's own original text) is
not actually possible with these functions as they exist: they take no
user-id argument to pass.

Calling them as-is from the backend's JDBC connection would silently
evaluate `auth.uid()` as `null` (PostgREST/GoTrue is what populates that
session-local setting per request; a direct JDBC connection never gets
it), which means `is_household_member(...)` would always return `false` —
an outage, not a security hole, but still wrong. Making it return the
right answer would require `SET LOCAL request.jwt.claim.sub = ...` (or
equivalent) to fake the PostgREST session context per request — exactly
the "fragile plumbing to fake it" this ADR's Decision section already
named as "an explicit foot-gun this ADR rejects" one paragraph earlier.
Reusing the named functions and rejecting that plumbing turned out to be
mutually exclusive; this addendum resolves that in favor of rejecting the
plumbing, since that was the stronger and more deliberate original
commitment.

**Resolution — Option A unchanged in spirit, corrected in mechanism:**

- `is_household_member()` / `is_household_admin()` remain exactly as they
  are, unmodified. They stay the correct, sole enforcement mechanism for
  every path that goes through Supabase/PostgREST/RLS (the PWA, today's
  RPCs). Nothing about that path changes.
- The Spring backend does **not** call them, and does **not** attempt to
  populate `auth.uid()` or any other PostgREST session-local setting on
  its JDBC connection. No `SET LOCAL`, no faked JWT claims in the
  Postgres session.
- Instead, the backend independently validates the caller's Supabase JWT
  (already true since P1 — see ADR-003) and re-derives the exact same
  security property those functions encode — "does this authenticated
  user belong to this household" — via an explicit, parameterized SQL
  query against `household_members`, using only the `sub` claim from that
  validated JWT (`AuthenticatedUser.id()`), never a client-supplied value:

  ```sql
  select household_id from household_members where user_id = ?
  ```

  This is a one-line read of the same junction table the functions
  themselves query — not a reimplementation of business logic, and not a
  second, divergent copy of a rule that could drift; it is the same
  predicate, parameterized explicitly instead of via a session GUC that
  isn't available on this connection.
- Household resolution does not truncate the result with `LIMIT 1`. The
  product invariant is "exactly one household per user" (enforced by
  `redeem_household_invite`, which deletes any prior membership before
  inserting the new one — see that migration's own comment), and the
  resolver checks that invariant instead of assuming it:
  - 0 rows → the user has no household (a distinct, expected condition,
    not an error swallowed into "pick nothing").
  - 1 row → that household is the authorized scope for every query this
    request makes.
  - >1 rows → an inconsistent state that should not be possible given the
    invariant above. Fails loudly and observably (logged server-side with
    the user id, a generic error to the client) rather than silently
    picking one via `ORDER BY ... LIMIT 1` the way the pre-P2 frontend
    code (and this ADR's original example) did.
- Any further authorization within that household (e.g. "does this
  `profileId` belong to this household") is likewise always re-derived
  from the authenticated `userId` → resolved `householdId`, and checked
  against the database — never accepted at face value from a request
  parameter, path variable, or client-asserted `householdId`/`profileId`.

No schema, RLS policy, or SQL function changed to make this decision —
this addendum is a correction to this document's own text and to how the
backend queries an existing table, nothing else.
