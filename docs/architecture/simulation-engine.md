# Simulation Engine — P5-SIMULATION-ENGINE

Companion to `financial-domain.md` (P2, reused unchanged), `financial-tools.md` (P3, reused
unchanged), and `assistant-foundation.md` (P4, extended with two new tools). P5 adds the first
canonical simulation engine: hypothetical-scenario analysis that never writes to real financial
data.

## Objective

Answer "what if" financial questions — "posso comprar X?", "quanto consigo guardar por mês?" —
with the same rigor as `get_financial_summary`: deterministic, `BigDecimal`-exact, tenancy-checked,
and honest about what is a real fact versus a hypothesis.

## Architecture

```
PostgreSQL/Supabase
      |
Financial Domain            (FinancialCalculator, PriorityCalculator — P2/P3, unchanged)
      |
Simulation Engine           (com.aval.finance.simulations — pure calculators, no Spring)
      |
Simulation Use Cases        (SimulatePurchaseUseCase, SimulateSavingsUseCase — orchestration,
      |                       reuse GetFinancialSummaryUseCase/PriorityRepository, no duplication)
      |
Simulation Tools            (SimulatePurchaseTool, SimulateSavingsTool — com.aval.assistant.tools)
      |
Assistant Tool Registry     (2 new AssistantTool adapters — registry now has 7 tools total)
      |
Assistant Orchestrator / LLM (unchanged from P4)
```

Also reachable directly over HTTP: `POST /api/v1/tools/simulate-purchase` / `simulate-savings`
(Fase 11 — POST, unlike P3's `GET /api/v1/tools/*`, because these accept multiple optional,
occasionally-nested fields — `goalId`, `mode` — that fit a JSON body better than a query string;
this is a deliberate, documented deviation from P3's convention, not an oversight).

## Read-only guarantee — how it's actually enforced

Not a policy statement alone — structural:

- `PurchaseSimulationCalculator`/`SavingsSimulationCalculator` are pure static methods with no
  field, no injected repository, no `JdbcClient` — they cannot issue SQL even by mistake.
- `SimulatePurchaseUseCase`/`SimulateSavingsUseCase` only call `find*`/`resolve*` methods already
  in P2/P3's repositories (`GetFinancialSummaryUseCase`, `FinancialMonthRepository`,
  `PriorityRepository`) — none of those interfaces expose an `insert`/`update`/`delete` method at
  all, so there is nothing here for a use case to accidentally call.
- A hypothetical purchase is represented purely as an in-memory `PurchaseSimulationResult` (a
  Java record) — never a row, never an object that could be persisted by a later, unrelated code
  path.
- `SimulationIntegrationTest#runningSeveralSimulationsNeverWritesToAnyTable` proves this against
  real Postgres: row counts for every table a simulation reads (`expenses`, `priorities`,
  `finance_months`, `financial_profiles`, `households`, `household_members`) are asserted
  identical before and after running several simulations (including a `NOT_FEASIBLE` one), and
  the specific expense row simulated against is checked byte-for-byte unchanged.

## Feasibility rule — investigated, and why the existing V0 rule was not reused

The V0 PWA already has a purchase-feasibility rule: `getPurchaseResult`/`PurchaseSimulatorDialog`
(`dialogs.tsx`), which compares the amount against `free` and a `weeklyAllowance = free /
daysLeft * 7`. This was investigated first, as required, before choosing a rule for P5 — and
found **not reusable as-is**, for three concrete reasons, not preference:

1. `daysLeft` depends on the wall clock ("today") — P2 deliberately did **not** port this concept
   into the Java domain (`financial-domain.md`, "Month headline decision"), precisely because it
   mixes financial math with UI-only presentation logic.
2. A rule that reads `LocalDate.now()` is not reproducible — the same `simulate_purchase` call
   (same amount, same month, same scope) would answer differently on different days, violating
   this engine's own determinism/reproducibility principles (Fase 2, points 1 and 6).
3. The V0 rule only ever operates on the UI's *currently active* month; this backend tool accepts
   an arbitrary `month` (including past ones), where "days left in the week" has no defined
   meaning.

Given an existing rule that is real but **incompatible**, the fallback this task itself specified
for exactly that situation applies: use only objective mathematical facts, documented explicitly.

**Decision:** `projectedFree > 0` → `FEASIBLE`; `== 0` → `WARNING`; `< 0` → `NOT_FEASIBLE`. No
percentage threshold, no "healthy spending limit" — nothing beyond the sign of a number P2's own
domain already computes.

## simulate_purchase

### Semantics (defined explicitly before implementation)

- `purchaseAmount` (required, `> 0`), `installments` (optional, default 1, `>= 1`, always
  interest-free — no rate is ever accepted or invented; see "Installments" below).
- The real `budget`/`total`/`free` for the given `month`/`scope` come from
  `GetFinancialSummaryUseCase` (P2/P3), unmodified.
- **Only the first installment counts against the simulated month** — a real installment
  purchase only debits one parcel per month; `projectedTotal = currentTotal + firstInstallment`,
  `projectedFree = currentFree - firstInstallment`. Later installments fall on future months this
  single-month simulation does not model (see the `SINGLE_MONTH_IMPACT` assumption, attached
  whenever `installments > 1`).

### Installments / rounding

`total` is split into `installments` parts whose sum is **always exactly** `purchaseAmount`:
divide in integer cents (`Money`'s own scale-2 invariant guarantees `unscaledValue()` is exactly
the cent count), every installment gets `totalCents / installments` cents, and the remainder
(always `< installments` cents) is distributed as one extra cent each to the **first** `remainder`
installments. E.g. `100.00` split 3 ways → `[33.34, 33.33, 33.33]`. A simple, deterministic,
auditable convention — not a "fair rounding" heuristic — tested by
`PurchaseSimulationCalculatorTest` including a 7-way split of `1000.01`.

### Output

`purchaseAmount`, `installments`, `installmentSchedule`, `currentBudget`/`currentTotal`/
`currentFree` (CALCULATED — carried through from the real summary), `projectedTotal`/
`projectedFree` (CALCULATED, derived here), `status`, `assumptions`
(`HYPOTHETICAL_SCENARIO`, `NO_INTEREST_INSTALLMENTS`, and `SINGLE_MONTH_IMPACT` when
`installments > 1`), `warnings` (`BUDGET_EXCEEDED`/`TIGHT_BUDGET` when applicable).

## simulate_savings

### Two explicit modes — never inferred

`SavingsSimulationMode.TIME_TO_TARGET` ("quando chego em R$X guardando R$Y/mês?") and
`FUTURE_VALUE` ("se eu guardar R$Y/mês por N meses, quanto terei?") are selected by an explicit
`mode` field the caller must send — never guessed from which optional fields happen to be
present, to avoid silently answering a different question than the one asked.

### Data sourcing — `goalId` or explicit values, never an implicit guess

`currentSaved`/`targetAmount` may be sourced from a real goal via an explicit `goalId` (looked up,
tenancy-checked, via `PriorityRepository` scoped to the caller's household — a foreign
household's goal id is `RESOURCE_NOT_FOUND`, identical to P3's `get_goals`). **A bare
scope/month never implicitly picks "the" goal** — a household can have several, and guessing one
risks a silently wrong answer. Without `goalId`, the caller must supply the values explicitly;
missing ones are a `400 VALIDATION_ERROR`, never a guessed zero.

### No interest — a deliberate scope limit, not an oversight

Every `simulate_savings` result carries the `NO_INTEREST_SAVINGS` assumption. `FUTURE_VALUE`
accumulates via repeated `Money.add` (`projectedSaved = currentSaved + monthlyContribution ×
months`, computed as a loop of additions — `Money` deliberately has no multiply operation; see
its own javadoc — never a new one added here either).

### `TIME_TO_TARGET` edge cases

- `remainingAmount = max(0, targetAmount − currentSaved)` — the exact same clamp-at-zero formula
  `PriorityCalculator` already uses for a goal's remaining amount, reused rather than
  re-derived.
- Already met (`remainingAmount == 0`, including `targetAmount == 0` or `currentSaved >=
  targetAmount`): `monthsRequired = 0`, `estimatedTargetMonth` = the input month, `FEASIBLE`.
- `monthlyContribution == 0` with `remainingAmount > 0`: **never a fabricated month count** —
  `monthsRequired`/`estimatedTargetMonth` are both absent, status `NOT_FEASIBLE`, warning
  `ZERO_CONTRIBUTION`.
- Otherwise: `monthsRequired = ceil(remainingAmount / monthlyContribution)` — rounded up, because
  a fractional month still requires that whole month to pass before the target is reached.
  `estimatedTargetMonth = month.plusMonths(monthsRequired)`.
- `monthlyContribution < 0` / `targetAmount < 0` / `currentSaved < 0`: rejected as `400
  VALIDATION_ERROR` before either calculator runs — never a computed "scenario" for a
  nonsensical input.

## Pure domain (`com.aval.finance.simulations`)

`PurchaseSimulationCalculator`/`SavingsSimulationCalculator` — no Spring, no I/O, no `LocalDate.now()`,
no knowledge of HTTP/JWT/Gemini/`AssistantTool`. Every input/output is a typed record
(`PurchaseSimulationResult`, `TimeToTargetResult`, `FutureValueResult`,
`SimulationAssumption`, `SimulationWarning`, `SimulationStatus`) — tested directly by
`PurchaseSimulationCalculatorTest`/`SavingsSimulationCalculatorTest`, with no Spring context.

## Application use cases

`SimulatePurchaseUseCase` delegates entirely to `GetFinancialSummaryUseCase` for the real
budget/total/free — no repository, no tenancy check, and no formula is duplicated here (the same
asymmetry `GetFinancialSummaryTool` already documents in `financial-tools.md`: the use case
resolves its own household internally). `SimulateSavingsUseCase` only touches
`FinancialMonthRepository`/`PriorityRepository` when a `goalId` was supplied — otherwise it never
reads the database at all, since a fully-hypothetical savings question needs no real data beyond
proving the caller has a valid, resolved household (via `ToolExecutionContext`).

## Integration with the Assistant Tool Registry

Two new `@Component` classes, `SimulatePurchaseAssistantTool`/`SimulateSavingsAssistantTool`
(`com.aval.assistant.tools`), implementing the same `AssistantTool` interface as P3's five —
`AssistantToolRegistry` picks them up automatically via Spring's `List<AssistantTool>` injection,
with zero change to the registry class itself. Registry after P5:

```
get_financial_summary, get_expenses, compare_months, get_goals, get_household_profiles,
simulate_purchase, simulate_savings
```

Exactly 7 — proved by `AssistantToolRegistryIntegrationTest` against the real, fully-wired Spring
context (not mocks). An unregistered tool name (prompt-injected or otherwise) is still simply not
found — unchanged behavior from P4.

## Security / tenancy

Identical posture to every other tool: `AuthenticatedUser` → `HouseholdAccessService` →
`ToolExecutionContext` (or, for `simulate_purchase`'s asymmetric case, straight through to
`GetFinancialSummaryUseCase`'s own resolution) → real, tenancy-checked data. No tool, use case, or
controller accepts a `householdId`/`userId` from the client. A `profileId`/`goalId` from another
household is `RESOURCE_NOT_FOUND`, never leaking existence — proven for both simulations by
`SimulationIntegrationTest` against two real, independent households in Postgres.

## Input hardening (P5.1)

The P5 final review documented a medium risk: `installments`, `months`, and every monetary field
had no upper bound on the two HTTP endpoints — an authenticated user could send an absurdly large
value, causing a resource-heavy single request (bounded to that request/thread, requiring a valid
JWT, but a real gap versus P3's own precedent of capping numeric inputs, e.g. `get_expenses`'s
`pageSize`). Closed by `com.aval.finance.simulations.SimulationLimits`:

| Limit | Value | Rationale |
|---|---|---|
| `installments` | 1–120 | A purchase parcelled over more than 10 years is outside this tool's intended horizon — an operational ceiling, not financial advice. |
| `months` (`FUTURE_VALUE`) | 0–1200 | Same 10-year horizon, applied to the projection window. |
| Money magnitude | `numeric(14,2)`'s own capacity (12 integer digits + 2 decimal, i.e. up to `999999999999.99`) | Not an arbitrary smaller cap — the exact ceiling every real money column in this schema already enforces (see `financial-domain.md` "Money"). A simulation input is never persisted, but staying within the same magnitude every real value here already respects keeps "hypothetical" and "real" directly comparable, and rejects a value no genuine record could ever hold regardless. |

Enforced at two layers, both **before** any allocation/iteration proportional to the input: the
`AssistantTool` adapters and HTTP controllers (a proper `400 VALIDATION_ERROR`), and defensively
inside the pure calculators themselves (`IllegalArgumentException` — never reached via the real
entry points, but a real guard if this package is ever called another way).

### Two real vulnerabilities found while implementing this, neither purely hypothetical

1. **Exponent-notation memory bomb.** `Money.of(new BigDecimal("1e999999999"))` — an 11-character
   string — forces `BigDecimal.setScale` to materialize a value with roughly one billion digits,
   because the unscaled value (`1`) must be multiplied by `10^999999999` to reach scale 2. Closed
   by `SimulationLimits.assertRepresentable`, which checks `precision() - scale()` (cheap — it
   never touches the value's actual digits) **before** `Money.of()` ever calls `setScale`. A
   companion length cap (32 characters) closes the simpler "literal string of a billion `9`s"
   variant, rejected before `new BigDecimal(String)` even runs.
2. **Extreme negative exponent overflow.** Empirically verified (not assumed): `new
   BigDecimal("1e-999999999").setScale(2, HALF_UP)` does not hang or exhaust memory — it throws a
   raw `ArithmeticException` ("BigInteger would overflow supported range"), which
   `assertRepresentable`'s digit-count check alone does not catch (the magnitude there is tiny,
   not huge). `SimulationLimits.toBoundedMoney` now catches this specific `ArithmeticException`
   and normalizes it into the same `IllegalArgumentException` every other rejection uses, so no
   caller can forget to catch it separately.
3. **Month-count integer overflow in `TIME_TO_TARGET`.** `remaining / monthlyContribution` can
   exceed `Integer.MAX_VALUE` for legitimate (if extreme) inputs — e.g. a target near the maximum
   representable amount against a small monthly contribution — and `BigDecimal.intValueExact()`
   threw an uncaught `ArithmeticException`. Found by this hardening round's own test suite, not
   synthesized. Fixed by checking the computed month count against the same `MAX_MONTHS` ceiling
   `FUTURE_VALUE` already uses (not a new, separately-invented threshold) **before** calling
   `intValueExact()`; beyond that horizon the result is `NOT_FEASIBLE` with a
   `TARGET_BEYOND_SUPPORTED_HORIZON` warning, never a crash or a guessed number.

None of this changed any P2/P3/P5 financial formula — every fix rejects an input earlier or
reclassifies an unreachable plan as `NOT_FEASIBLE`; the math for every value that was already
being tested (and every value within the new bounds) is byte-for-byte unchanged.

## Data minimization

Same rule as P3/P4: no JWT, email, userId, householdId, or internal DB id ever reaches the LLM.
A simulation's result necessarily contains financial values (that is the point of asking), but
nothing beyond what's needed to explain it — no extra metadata, no unrelated real numbers.

## Not implemented this round (explicitly out of scope)

Open Finance, Pluggy, Expo/React Native, frontend migration, any write path (no expense/goal is
ever created from a simulation), persistent conversation memory, `simulate_income_change`,
`simulate_debt_payoff`, `simulate_goal_contribution`, `simulate_budget_change`, interest/yield
modeling of any kind, and any AI-executable financial action.

## Decisões pendentes

- A real interest-bearing savings/investment model (if ever requested) needs its own explicit
  product decision about which rate source to trust — not resolved here, deliberately.
- `simulate_purchase`'s "only the first installment counts" semantics assumes a standard
  credit-card-style installment purchase; a product decision to model a different payment
  structure (e.g. a loan with its own amortization schedule) would need a new, explicitly-scoped
  tool, not a silent extension of this one.
