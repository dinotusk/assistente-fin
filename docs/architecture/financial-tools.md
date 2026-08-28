# Financial Tools — P3-FINANCIAL-TOOLS

Companion to `docs/architecture/financial-domain.md` (the P2 domain these tools are built
entirely on top of) and `ADR-004-tenant-household-authorization.md` (the tenancy model every
tool reuses unchanged). P3 adds no new financial formula, no new tenancy mechanism, and no LLM —
it is a thin, deterministic Tool layer over the P2 domain, callable over plain HTTP today and by
a future Assistant tomorrow.

## Objective

Five Financial Tools, each: deterministic, LLM-independent, individually testable, tenancy-
checked, built exclusively on the P2 Financial Domain, honest about RECORDED vs CALCULATED
values, unable to invent a number the data doesn't support.

```
Client / future AI
      |
Financial Tool           (com.aval.assistant.tools — thin, no calculation)
      |
Application / Use Case   (com.aval.finance.*, com.aval.household — orchestration, no calculation)
      |
Financial Domain         (FinancialCalculator, FinancialComparisonCalculator, PriorityCalculator — pure math)
      |
Repositories              (Jdbc*Repository — parameterized SQL)
      |
PostgreSQL
```

No tool executes its own SQL-plus-arithmetic shortcut; every calculation traces back to
`FinancialCalculator`, `FinancialComparisonCalculator`, or `PriorityCalculator` — never to a
query result added up ad hoc in a controller or Tool class.

## Tool contract — why explicit types, not a generic `FinancialTool<I,O>`

Inspected first: a generic interface would buy nothing here — the five tools take genuinely
different inputs (one takes two months, one takes pagination, one takes no scope at all) and a
shared `execute(context, input)` signature would either need `Object`-typed erasure or five
near-identical generic instantiations for zero code reuse. Explicit classes
(`GetFinancialSummaryTool`, `GetExpensesTool`, `CompareMonthsTool`, `GetGoalsTool`,
`GetHouseholdProfilesTool`) were chosen instead — each a thin `@Service` whose `execute(...)`
method takes exactly the parameters that tool needs and returns exactly the domain type its use
case produces. This is a direct instance of the "tipos explícitos > abstração sofisticada" rule
this phase was scoped under.

One deliberate asymmetry: **`GetFinancialSummaryTool` does not build a `ToolExecutionContext`**
— it forwards straight to P2's own `GetFinancialSummaryUseCase`, which already resolves the
household from `AuthenticatedUser` itself. Re-deriving a `ToolExecutionContext` in front of it
would be a second, redundant `household_members` query for no benefit, and P2's use case was not
to be modified this round. The other four tools (all new this phase) build their own
`ToolExecutionContext` up front, once per request.

**`GetHouseholdProfilesTool` has no dedicated use case class.**
`HouseholdAccessService.activeProfiles(householdId)` already *is* the tenancy-resolved,
sortOrder-ordered application-layer read this tool needs; wrapping that single method call in
its own `UseCase` would be exactly the premature ceremony this phase's rules warn against.

## ToolExecutionContext

```java
record ToolExecutionContext(AuthenticatedUser user, UUID householdId)
```

Created exclusively server-side, via `ToolExecutionContext.resolve(user, householdAccess)`,
which internally calls `HouseholdAccessService.resolveHouseholdId(user.id())` — the exact same
"0 → not found, 1 → authorized, >1 → loud internal error" resolution `GetFinancialSummaryUseCase`
already uses (ADR-004 addendum). No constructor accepts a raw household id, so a Tool cannot be
handed a client-supplied one even by mistake. The client never sends, and no code path ever
trusts, a `householdId` or `userId` from a request body/parameter/path variable.

## The five tools

| Tool | HTTP endpoint | Use case | New domain code |
|---|---|---|---|
| `get_financial_summary` | `GET /api/v1/tools/financial-summary` | `GetFinancialSummaryUseCase` (P2, unchanged) | none |
| `get_expenses` | `GET /api/v1/tools/expenses` | `ListExpensesUseCase` | `ExpenseSearchCriteria`, `ExpensePage`, `ExpenseRepository#search` |
| `compare_months` | `GET /api/v1/tools/compare-months` | `CompareMonthsUseCase` | `FinancialComparisonCalculator`, `CategoryComparison`, `MonthComparisonResult` |
| `get_goals` | `GET /api/v1/tools/goals` | `GetGoalsUseCase` | `Priority`, `PriorityStatus`, `PriorityRepository`, `PriorityCalculator`, `GoalView`, `FinancialCalculator#prioritiesFor` |
| `get_household_profiles` | `GET /api/v1/tools/household-profiles` | `HouseholdAccessService.activeProfiles` (P2, unchanged) | none |

`GET /api/v1/financial-summary` (P2) keeps working unmodified; the `/tools/*` endpoint is an
additional, identical-contract route, not a replacement.

### get_financial_summary

Unchanged from P2: `month` (YYYY-MM) + `scope` (`me`/`household`/`profile`, the last requiring a
UUID `profileId`) → budget, total (expenses only, income excluded), paid, pending, received
(income only), free, topCategory. See `financial-domain.md` for the full parity matrix — nothing
here reinterprets it.

### get_expenses

Filters: `month` (required), `scope`, `category` (exact match), `status` (`paid`/`pending`),
`entryType` (`expense`/`income`), `page`/`pageSize` (default 0/50, `pageSize` capped at 200).
`entryType` is the one place this tool must never blur: an `income` row is never counted as a
gasto — it is simply a different row `EntryType` distinguishes, exactly like `FinancialEntry`
already models it.

Ordering: `expense_date desc, id desc` — most recent first, `id` as a **deterministic** (not
chronological) tiebreak for two rows sharing a date. Pagination fetches `pageSize + 1` rows and
trims the extra one to compute `hasMore` — no separate `COUNT(*)` query.

The scope-to-owner-filter resolution (`ListExpensesUseCase#resolveOwnerFilter`) mirrors
`FinancialCalculator#entriesFor`'s exact "position, not kind" rule: `household` → no filter,
`me` → the sortOrder-0 profile's id, `profile` → the exact id, validated against the caller's
household first (a foreign household's profile id is `RESOURCE_NOT_FOUND`, never leaking
existence).

Query shape: 1 (household resolution) + 0–1 (profile validation) + 1 (month lookup) + 1
(the filtered/paginated query) = 3–4, independent of `pageSize` or filter count.

### compare_months

Inputs: `monthA` (baseline), `monthB` (comparison), `scope`. Every scalar (`expensesDelta`,
`budgetDelta`, `freeDelta`, `receivedDelta`) and every category delta is `monthB − monthA`,
computed by `FinancialComparisonCalculator` from two independently-loaded `FinancialSummary` +
full category-breakdown pairs — never re-derived by hand in the use case.

**Percent policy** (see `Percent.ofDelta`): `(monthB − monthA) / monthA × 100`, `BigDecimal`
throughout, 10-digit intermediate precision, final result scaled to 2 decimals with
`HALF_UP`. **`NOT_APPLICABLE`, never a fabricated 0% or 100%, whenever `monthA` is zero** — a
percent change from a zero baseline is mathematically undefined. Worked examples from the P3
spec, both verified by `PercentTest`/`FinancialToolsIntegrationTest`:

- 4000 → 5000: `delta=+1000`, `deltaPercent=+25.00` (`status: OK`)
- 0 → 1000: `delta=+1000`, `deltaPercent` → `status: NOT_APPLICABLE`, `value: null`

Category deltas (`FinancialComparisonCalculator.compareCategories`) iterate `Categories.ORDER`
and include a category if it has a non-zero total in *either* month — a category absent from
both is omitted (nothing to compare); a category absent from only one already means its total
there is zero (categoryTotals' own `> 0` filter, unchanged from P2), which is not a new NO_DATA
case, just that pre-existing semantic carried through.

Query shape: 1 (household) + 0–1 (profile validation, shared across both months) + 1 (active
profiles, shared) + 2 × (1 month + 1 budgets + 1 expenses) = 8–9 total. **Never one query per
category** — `compareCategories` runs entirely in memory over data each month's single
`expenses` query already fetched.

### get_goals

"Goal" is the external, tool-facing name for what the schema and the frontend already call a
**Priority** (`priorities` table) — see "Modelagem real" below. No new domain concept was
invented; `com.aval.finance.goals.Priority` is a 1:1 port of the existing row shape.

Per-goal fields: `targetAmount`/`savedAmount` (RECORDED — stored columns, read as-is),
`remaining` and `progress` (CALCULATED, by `PriorityCalculator`, exact port of `ai.ts`'s GOALS
progress math):

```
remaining = max(0, target - saved)          // never negative, even when saved > target
progress  = target > 0 ? min(100, saved/target * 100) : 0.00   // never NOT_APPLICABLE
```

`progress` deliberately does **not** use `Percent.ofDelta`'s zero-baseline `NOT_APPLICABLE` rule
— a zero-target goal is a normal, common state (no amount set yet), and the frontend's existing
AI context (`ai.ts`, GOALS branch) already treats it as `0` progress, not an error. Reusing that
precedent is parity, not a new invention; see `Percent.ofProgressRatio`'s javadoc for why this
and `compare_months`'s zero-baseline case deliberately disagree.

Scope resolution (`FinancialCalculator#prioritiesFor`) is the same positional rule as
`entriesFor`, applied to `priorities.profile_id` instead of `expenses.owner_profile_id` — kept
inside `FinancialCalculator` (not a new `finance.goals`-local copy) so the "position, not kind"
rule stays the one place `financial-domain.md` already says it must live.

Query shape: 1 (household) + 0–1 (profile validation) + 1 (month lookup) + 1 (priorities query)
= 3–4.

### get_household_profiles

No filters beyond authentication. Returns `id`, `name`, `kind`, `sortOrder` for every active
profile in the caller's own resolved household, ordered by `sortOrder` — exactly
`HouseholdAccessService.activeProfiles`'s existing contract. Never a user id, a household id
from another household, or anything auth-related. Query shape: 2 (household resolution +
profiles).

## Modelagem real investigada — Priorities ("Goals")

Before writing any code, `types.ts`, `PrioritiesView.tsx`, `dialogs.tsx`, `ai.ts`,
`aiRequestValidation.ts`, `supabaseRepository.ts`, and the `priorities` table's migrations
(`20260726013000_initial_finance_schema.sql`) were read. Findings:

- **Schema** (`priorities`): `id, household_id, month_id (FK finance_months), profile_id (FK
  financial_profiles), description, target_amount numeric(14,2) NOT NULL >= 0, saved_amount
  numeric(14,2) NOT NULL DEFAULT 0 >= 0, priority smallint 1–3 DEFAULT 2, status text ('A pagar'
  | 'Pago' | 'Adiar') DEFAULT 'A pagar', created_by, created_at, updated_at`.
- **Frontend `Priority` type** (`types.ts`) maps 1:1: `name↔description`,
  `amount↔target_amount`, `rank↔priority`, `saved↔saved_amount`, `status↔status`,
  `responsavel↔`a **derived, not stored** display name resolved from `profile_id` via
  `profileNames.get(priority.profile_id)` in `supabaseRepository.ts`, falling back to the
  household's first profile's name.
- **Scope**: `priorityMatchesView` (`calc.ts`) resolves a priority's owner the same way
  `expenseMatchesView` resolves an expense's — by (effectively) position, via `responsavel`
  compared against `resolveViewOwner(view, people)`. `FinancialScope` applies identically to
  priorities and expenses; there was no ambiguity to resolve here.
- **Progress precedent**: `ai.ts`'s `GOALS` branch (the only place the frontend already computes
  a priority's progress, for its AI-assistant context) is `progresso = valorAlvo > 0 ?
  min(1, saved/valorAlvo) : 0`, `faltante = max(0, valorAlvo - saved)`. `PriorityCalculator`
  ports this exactly (scaled to a 0–100 `Percent` instead of a 0–1 fraction).
- The priority-creation dialog (`dialogs.tsx`) has no UI field for `saved` at all — in practice
  every priority is created with the DB default `saved_amount = 0` and only reaches a non-zero
  value some other way this investigation did not need to trace further, since `saved_amount` is
  always a real, non-null number by the column's own `NOT NULL DEFAULT 0` constraint (unlike the
  frontend's defensive `typeof item.saved === "number"` check, which guards against a
  not-yet-synced local record, not against the database ever omitting it).

No ambiguity blocked implementation; the "pare e reporte" gate for this tool was not triggered.

## Provenance decision

**Option A — reuse the existing `ProvenancedMoney`/`Provenance` type (RECORDED/CALCULATED)
everywhere a P3 tool returns money, rather than inventing a second wrapper or a response-level
metadata blob.** It already exists, is already proven by P2, and generalizes cleanly:

| Value | Provenance |
|---|---|
| `get_financial_summary` budget/total/paid/pending/received/free | CALCULATED (unchanged from P2) |
| `get_expenses` item `amount` | RECORDED (a stored column, read as-is) |
| `get_goals` `targetAmount`/`savedAmount` | RECORDED (stored columns) |
| `get_goals` `remaining`/`progress` | CALCULATED (derived by `PriorityCalculator`) |
| `compare_months` every delta | CALCULATED (derived by `FinancialComparisonCalculator`) |

Option B (per-response metadata) was rejected: it would separate a value from the fact that
describes it, forcing every consumer to cross-reference two places. Option C (defer) was
rejected: the distinction was needed *now* for `get_expenses`/`get_goals` to be honest about
"R$ 500 foi registrado" vs "R$ 100 foi calculado" — the exact motivating example this phase was
scoped under — so deferring would ship a materially less useful contract.

## NO_DATA / ZERO / NOT_APPLICABLE

Three distinct situations, deliberately not collapsed into one:

- **NO_DATA** — a month that doesn't exist for the household (no `finance_months` row). Every
  tool that needs a month (`get_financial_summary`, `get_expenses`, `compare_months` for either
  month, `get_goals`) surfaces this as `404 RESOURCE_NOT_FOUND` — the exact mechanism P2 already
  established for `get_financial_summary`, not a new in-body sentinel. A household with a month
  but zero priorities/expenses in it returns an **empty list**, not a 404 — the month genuinely
  has data, there is just nothing matching this query (see
  `aHouseholdWithNoGoalsReturnsAnEmptyListNeverAnError`).
- **ZERO** — a category absent from one side of a `compare_months` comparison (its total there
  really is zero, given `categoryTotals`' pre-existing `> 0` filter — this is not new P3
  semantics); a `get_goals` `remaining` of zero when `saved >= target`; a `get_expenses` result
  set that is genuinely empty after filters.
- **NOT_APPLICABLE** — exclusively a `compare_months` percent whose baseline month is zero (see
  `Percent.ofDelta`). Never used for `get_goals` progress (see "Percent policy" above) and never
  used to mean "we don't know" — every NOT_APPLICABLE in this phase means "this specific ratio is
  mathematically undefined," not "data is missing."

## Security model

Unchanged from ADR-004's addendum, reused by every new tool without exception:

1. JWT validated by Spring Security's OAuth2 resource server (ADR-003) → `AuthenticatedUser`.
2. `AuthenticatedUser.id()` (the JWT `sub` claim) → `HouseholdAccessService.resolveHouseholdId`
   → the caller's own household, via a parameterized `household_members` query. 0 rows → 404: 1
   row → authorized; >1 rows → a logged, generic 500 (an invariant violation, not "pick one").
3. A `scope=profile` request's `profileId` is always re-validated against that resolved
   household (`HouseholdAccessService.resolveProfile`) before use — a foreign household's real
   profile id is `RESOURCE_NOT_FOUND`, identical to a nonexistent one, never leaking which case
   it was.
4. No tool, use case, or repository accepts a `householdId` from a request parameter, body, or
   path variable. No `SET LOCAL`, no faked `auth.uid()`, no PostgREST session emulation — the
   direct-JDBC posture ADR-004 already committed to is unchanged.

`FinancialToolsIntegrationTest` proves this against two real, independent households (A:
Ana/Rafael/Beto; B: Carla) seeded into real Postgres via Testcontainers — not by inspecting
queries, but by calling each use case end to end and asserting household B's data never
surfaces for household A's user, and vice versa, across all four new tools.

## Error semantics

Every error funnels through the existing `ApiErrorResponse`/`GlobalExceptionHandler` (P1/P2,
unchanged) — never a stack trace, SQL text, table/class name, JWT, or token.

| Case | Type | HTTP |
|---|---|---|
| `month`/`monthA`/`monthB` not `YYYY-MM` | VALIDATION_ERROR | 400 |
| `scope` not one of `me`/`household`/`profile` | VALIDATION_ERROR | 400 |
| `scope=profile` missing/non-UUID `profileId` | VALIDATION_ERROR | 400 |
| `status`/`entryType` not a recognized value | VALIDATION_ERROR | 400 |
| `pageSize` outside 1–200, `page` negative | VALIDATION_ERROR | 400 |
| Missing/invalid bearer token | AUTHENTICATION_REQUIRED | 401 |
| Caller has no household | RESOURCE_NOT_FOUND | 404 |
| `profileId` not in caller's household (or doesn't exist) | RESOURCE_NOT_FOUND | 404 |
| Requested month has no `finance_months` row | RESOURCE_NOT_FOUND | 404 |
| Caller belongs to >1 household (invariant violation) | INTERNAL_ERROR | 500 (logged server-side) |

## OpenAPI

All five endpoints are documented via `@Operation`/`@Parameter` (springdoc, auto-generated —
same mechanism `FinancialSummaryController` already uses), reachable at `/v3/api-docs` /
Swagger UI outside the production profile. Each documents its query parameters, the `YYYY-MM`
month format, the `me|household|profile` scope enum, that money fields are JSON strings, that
percent fields carry an explicit `status: OK|NOT_APPLICABLE`, and the bearer-JWT security scheme
already registered by `OpenApiConfig`.

## Future LLM integration (not built this round)

Every Tool's `execute(...)` method already has a stable, typed Java signature independent of any
provider's function-calling schema. A future orchestration layer (Gemini/OpenAI/Anthropic
function calling, or a hand-rolled dispatcher) adapts *to* these signatures — generates a
provider-specific JSON schema from each Tool's input/output types, calls `execute(...)`, and
serializes the typed result back — without this phase's code needing to change. No SDK, prompt,
or function-calling schema was added this round; see the P3 spec's explicit prohibition.
