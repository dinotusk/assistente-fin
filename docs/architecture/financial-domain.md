# Financial Domain — P2-FINANCIAL-DOMAIN

Companion to `src/lib/finance/calc.ts` (the frontend's canonical financial truth,
see `calc.invariants.test.ts` for the 20 invariants) and to
`docs/architecture/ADR-004-tenant-household-authorization.md` (tenancy). This
document is the parity contract the Java port (`backend/src/main/java/com/aval/finance`,
`backend/src/main/java/com/aval/household`) must satisfy — **parity before
improvement**: nothing here reinterprets a TS rule; every branch traces back to
either an existing calc.ts behavior or an explicitly logged product decision.

## Glossary

| Term | Meaning |
|---|---|
| Household | A `households` row — the tenancy boundary. Every financial query is scoped to exactly one. |
| Financial profile | A `financial_profiles` row — a named budget/expense owner within a household (e.g. "Ana", "Rafael"). Not tied to a Supabase auth user. |
| Scope | Which slice of a household's data a request asks for: `household`, `me`, or `profile` (see `FinancialScope`). |
| Financial month | A `finance_months` row — one household's income/houseContribution for one calendar month (`period`). |
| Financial entry | An `expenses` row — despite the table name, holds both `expense` and `income` rows (`entry_type`). |

## Money

`com.aval.finance.Money` — `BigDecimal`, scale fixed at 2, mirroring every
money column's real, empirically-confirmed type: **`numeric(14,2)`, `NOT
NULL`**, consistently across `expenses.amount`, `finance_months.income`/`house_contribution`,
`profile_budgets.amount`, `priorities.target_amount`/`saved_amount` (checked
live against production, not inferred). No column is nullable, so `Money`
never needs to represent "no value" — a missing `profile_budgets` row (no
budget set for a profile) is a repository-level absence, defaulted to
`Money.ZERO` by the calculator, not a null `Money`.

None of the ported rules multiply or divide money — only add/subtract/compare
— so `HALF_UP` rounding is only ever a parsing-boundary safeguard, never
invoked by domain arithmetic on already-scale-2 values.

**Money JSON representation**: every money field in the API response is a
**string** (`"12200.00"`), never a bare JSON number. A `numeric(14,2)` value
round-tripped through a JS/JSON consumer's IEEE-754 double can silently lose
exact decimal precision (`12200.10` has no exact binary float representation)
— a string sidesteps this for every consumer (PWA, future Expo app, future AI
tool).

## FinancialScope

Replaces calc.ts's magic strings (`VIEW_ME`/`VIEW_ALL`/a profile name) with a
closed, sealed type: `Household`, `Me`, `Profile(profileId)`. Deliberately has
**no `Spouse` variant** — the PWA's `VIEW_SPOUSE` is not a distinct concept in
the data model, only shorthand for "the profile at position 1"; see "Position,
not kind" below.

**`scope=me` is a per-household UI selection, not a per-authenticated-user-owned
profile.** In the current product, "me" always resolves to the household's
`sortOrder=0` profile, regardless of which of the household's members
(authenticated logins) is asking — exactly like calc.ts's `resolveViewOwner`,
which never looks at the caller's identity at all. Any authenticated member of
a household may query any scope within that household. This is parity with
the PWA, not a new capability introduced by the API.

### Position, not `kind`

`financial_profiles.kind` (`person`/`household`/`managed`) does **not**
distinguish "the spouse" (position 1) from a 3rd+ named profile: both
`bootstrap_household` and `syncProfiles` (supabaseRepository.ts) assign
`'managed'` to every profile after the first. Only `sort_order` reliably
encodes the position calc.ts's `people[index]` relies on. The calculator
therefore resolves `FinancialScope.Profile` by `sortOrder`, never by `kind`
or by name.

## Provenance

`RECORDED | CALCULATED | ESTIMATED | RECOMMENDED`. P2 only ever produces
`CALCULATED` — every `FinancialSummary` field, even a scope=me budget that
happens to be a single column pass-through (`income`), is routed through
`FinancialCalculator`, so calling it CALCULATED is honest rather than a
stretch. `ESTIMATED`/`RECOMMENDED` are not implemented this round; true
`RECORDED` provenance would apply to a single ledger line item
(`FinancialEntry`), which `FinancialSummary` doesn't expose directly here.

## Parity matrix — calc.ts rule → Java

| calc.ts rule | Java | Notes |
|---|---|---|
| `budgetForView` (VIEW_ALL) | `FinancialCalculator.budgetFor` — `Household` case | `income + houseContribution`, profileBudgets of 3rd+ profiles never included (see "Known decisions") |
| `budgetForView` (VIEW_ME) | `Me` case | `income` |
| `budgetForView` (VIEW_SPOUSE) | `Profile` case, `sortOrder==1` | `houseContribution` |
| `budgetForView` (named profile) | `Profile` case, `sortOrder!=1` | `profile_budgets` lookup, default zero |
| `expensesForView`/`expenseMatchesView` | `FinancialCalculator.entriesFor` | `Household`→no filter, `Me`→sortOrder-0 profile id, `Profile`→exact id, no positional indirection |
| `calc()` total/paid/pending/received/free | `FinancialCalculator.summarize` | Identical formulas; `saving`/`paidRate`/`daysLeft` deliberately not ported (see "Month headline decision") |
| `getCategoryTotals` | `FinancialCalculator.categoryTotals` | Fixed category order (`Categories.ORDER`), `> 0` filter, stable sort descending |

### TS invariant → Java test

| calc.invariants.test.ts | Java test | Status |
|---|---|---|
| Invariante 1 (household = Σ profiles, no double counting) | `FinancialCalculatorTest.HouseholdFixtureTests#householdTotalEqualsSumOfEachProfilesTotal` | PASS |
| Invariante 2 (profile expenses = only that profile's) | `#eachProfileSeesOnlyItsOwnExpenses` | PASS |
| Invariante 3 (activeMonth never leaks) | Not re-ported — property of which `FinancialMonth` the repository loads by `month_id`, proven instead by `FinancialSummaryIntegrationTest` (household A/B isolation, distinct months) | N/A — different layer |
| Invariante 4 (view switch never mutates source) | Structurally true (records/lists, no mutation); not a dedicated test | N/A |
| Invariante 5 (hideValues cannot reach calc) | Structurally true (no such parameter exists in any Java signature) | N/A |
| Invariante 6 (category sum == total, same scope) | `#categoryTotalsSumEqualsTotalForHousehold` / `#categoryTotalsSumEqualsTotalForASingleProfile` | PASS |
| Invariante 7 (3rd+ profileBudgets excluded from household budget) | `#thirdProfileExpensesCountInHouseholdTotalButNotInHouseholdBudget` | PASS |
| Invariante 8 (DashboardView divergence) | Not ported — a divergence between calc.ts and one React component's own inline formula, not a calc.ts rule (see "Known UI divergence") | N/A — out of domain scope |
| Invariante 9 (TransactionsView == calc(), no filter) | Not re-ported — would test calc.ts against its own port | N/A |
| calc.test.ts `budgetForView` (4 cases) | `FinancialCalculatorTest.BudgetForViewTests` (5 tests, including the zero-budget-row default) | PASS |
| calc.test.ts `calc` (totals/paid/pending/free/topCategory) | `HouseholdFixtureTests#calcComputesTotalsPaidPendingFreeAndTopCategory` | PASS |
| getCategoryTotals (order/ties/`>0`) | `CategoryTotalsTests` (4 tests) | PASS |

Numeric parity demonstrated with the exact fixture calc.invariants.test.ts
uses (Ana/Rafael/Beto, August 2026): household total 1600, household budget
5500, Ana budget 4000, Rafael budget 1500, Beto budget 400 — same numbers in
both the pure `FinancialCalculatorTest` and the real-Postgres
`FinancialSummaryIntegrationTest`.

## Known decisions

- **PRESERVED — `VIEW_ALL`/`Household` excludes 3rd+ profile budgets.**
  `budgetForView(VIEW_ALL)` never sums `profileBudgets`, even though
  `expensesForView(VIEW_ALL)` includes that profile's expenses. Covered by an
  existing TS test (calc.test.ts) and Invariante 7. This is a **product
  decision pending, not a bug** — not resolved this round, only preserved.
- **CANONICAL — `pending`/`total` exclude income.** `calc.ts`'s formula, and
  the only one the Java domain implements.
- **NOT CHANGED — Dashboard "Divisão familiar" divergence.** `DashboardView.tsx:330-334`
  computes its own total/pending inline (`sum(expensesForView(...))`, no
  income exclusion), diverging from `calc()` whenever an income-type entry
  has status "A pagar" (dormant in production today — zero such rows exist).
  Not touched: the frontend is out of scope for P2, and `FinancialSummary`
  only ever implements calc.ts's canonical formula.
- **DEFERRED — semantics for 3rd+ profile scope requested via `scope=profile`
  for the sortOrder-0 profile.** The PWA's UI never produces this exact call
  shape (it always uses the `me` sentinel for position 0), so there's no TS
  precedent to preserve. The calculator falls through to the
  `profile_budgets` lookup branch — the same behavior calc.ts's
  `budgetForView` would produce if called with that profile's literal name
  instead of the `VIEW_ME` sentinel. Documented, not silently invented.
- **Month headline decision.** `getMonthHeadline` mixes financial math with
  Portuguese UI copy (`"O orçamento passou..."`). Not ported into the domain:
  the domain carries the underlying facts (`free`, and — not yet ported —
  `daysLeft`/next-due-date/category-growth) so a future consumer can build its
  own headline, but the sentence generation itself stays presentation-layer.
  `saving` and `paidRate` are likewise not part of `FinancialSummary`: neither
  is requested by this endpoint's contract (Fase 9/23 list exactly
  `total, received, pending, paid, free, budget, topCategory`), and porting
  them unused would be scope creep.

## Tenancy

See `ADR-004-tenant-household-authorization.md` and its P2 addendum in full.
Summary: `is_household_member()`/`is_household_admin()` remain the correct
mechanism for every Supabase/PostgREST/RLS path (unchanged); the Spring
backend cannot call them (they read `auth.uid()`, unavailable on a direct JDBC
connection) and instead re-derives the same property via explicit
parameterized SQL against `household_members`, using only the JWT `sub`
claim. Household resolution never uses `LIMIT 1`: 0 memberships → 404, 1 →
authorized, >1 → a logged, generic 500 (an invariant violation, not a
"just pick one" situation). Profile access within a household is always
re-checked against the resolved household id — a cross-household profile id
returns 404, never leaking existence.

## Database mapping

All confirmed live against production (read-only), not inferred from
migration files (one of which — `expense_bank_transaction_id.sql` — is
marked "NOT APPLIED" in its own header despite the column existing in
production; a reminder that migration files can lag reality).

| Table | Used for | Notes |
|---|---|---|
| `household_members` | Tenancy resolution | PK `(household_id, user_id)`, no `UNIQUE(user_id)` — "exactly one household per user" is enforced by `redeem_household_invite`'s own logic (deletes prior memberships), not a DB constraint |
| `financial_profiles` | `FinancialProfile` | `kind` does not encode position — see above |
| `finance_months` | `FinancialMonth` | `income`/`house_contribution` both `numeric(14,2) NOT NULL default 0` |
| `profile_budgets` | Budget lookup | composite PK `(month_id, profile_id)`, no `id` column, `numeric(14,2) NOT NULL default 0` |
| `expenses` | `FinancialEntry` | Both expense and income rows; `entry_type`/`status` stored as the exact Portuguese/English strings the frontend uses (`'Pago'`, `'A pagar'`, `'expense'`, `'income'`) — mapped, never translated in the DB |

## Repository architecture

`domain interface` + a single `Jdbc*` implementation per interface, in the
same package (no `infrastructure` sub-package ceremony — P1's own
`platform.config` doesn't split that way either). `com.aval.finance.summary`
is the one feature slice combining `com.aval.finance.budgets` and
`com.aval.finance.expenses`'s data via the pure `FinancialCalculator`. JDBC
(`JdbcClient`), not JPA — see ADR-002 (left open for P2) and this round's
concrete reasoning: read-only, no dirty-checking need, tenancy requires
visible/auditable SQL, schema is stable and pre-existing.

## Priorities/goals — explicitly out of scope

`Priority` (the `priorities` table) is not modeled in P2: Fase 5's model list
doesn't include it, and `financial-summary` doesn't need it. `EntryType`
covers `expenses.entry_type` only (`expense`/`income`); `priorities.status`'s
third value (`'Adiar'`) has no Java representation yet.
