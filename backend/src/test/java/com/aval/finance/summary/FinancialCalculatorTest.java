package com.aval.finance.summary;

import static org.assertj.core.api.Assertions.assertThat;

import com.aval.finance.Money;
import com.aval.finance.budgets.FinancialMonth;
import com.aval.finance.expenses.EntryType;
import com.aval.finance.expenses.ExpenseStatus;
import com.aval.finance.expenses.FinancialEntry;
import com.aval.household.FinancialProfile;
import com.aval.household.FinancialScope;
import com.aval.household.ProfileKind;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * TS invariant → Java test matrix (see docs/architecture/financial-domain.md for the full
 * write-up):
 *
 * <pre>
 * calc.invariants.test.ts Invariante 1 (household = sum of profiles, no double counting)
 *     -> HouseholdFixtureTests.householdTotalEqualsSumOfEachProfilesTotal
 * calc.invariants.test.ts Invariante 2 (profile expenses = only that profile's)
 *     -> HouseholdFixtureTests.eachProfileSeesOnlyItsOwnExpenses
 * calc.invariants.test.ts Invariante 3 (activeMonth never leaks) -> not re-ported: this is a
 *     property of which FinancialMonth row the repository loads (by month_id), not of
 *     FinancialCalculator itself, which only ever sees one month's data at a time by
 *     construction — see FinancialSummaryIntegrationTest for the repository-level proof instead.
 * calc.invariants.test.ts Invariante 4 (switching view never mutates source data)
 *     -> structurally true: every FinancialCalculator method takes and returns records/lists,
 *     never mutates an input. Not re-asserted as a dedicated test (nothing here is mutable).
 * calc.invariants.test.ts Invariante 5 (hideValues is presentation-only, cannot reach calc)
 *     -> structurally true: no method in this class accepts anything hideValues-shaped. Not a
 *     runtime-testable property in Java as it was in TS (calc.length assertions); the type
 *     signatures themselves are the proof.
 * calc.invariants.test.ts Invariante 6 (category totals sum == calc().total, same scope)
 *     -> HouseholdFixtureTests.categoryTotalsSumEqualsTotalForHousehold /
 *        HouseholdFixtureTests.categoryTotalsSumEqualsTotalForASingleProfile
 * calc.invariants.test.ts Invariante 7 (profileBudgets of 3rd+ profiles never sum into
 *     household budget) -> HouseholdFixtureTests.thirdProfileExpensesCountInHouseholdTotalButNotInHouseholdBudget
 * calc.invariants.test.ts Invariante 8 (DashboardView "Divisão familiar" divergence)
 *     -> NOT ported: this is a divergence between calc.ts and a specific React component's own
 *     inline formula (DashboardView.tsx:330-334), not a calc.ts rule. The domain calculator only
 *     ever implements calc.ts's canonical formula (income excluded from pending/total); see
 *     docs/architecture/financial-domain.md "Known UI divergence".
 * calc.invariants.test.ts Invariante 9 (TransactionsView totals == calc(), no filter active)
 *     -> not re-ported as a dedicated Java test: TransactionsView's formula is proven identical
 *     to calc.ts's own by the TS test suite itself, and FinancialCalculator IS calc.ts's port —
 *     re-deriving TransactionsView's inline formula in Java would test calc.ts against itself.
 * calc.test.ts "budgetForView" (4 cases: VIEW_ALL/VIEW_ME/VIEW_SPOUSE/named profile)
 *     -> BudgetForViewTests (4 tests below)
 * calc.test.ts "calc" (totals/paid/pending/free/topCategory + paidRate)
 *     -> HouseholdFixtureTests.calcComputesTotalsPaidPendingFreeAndTopCategory (paidRate excluded
 *        — see docs/architecture/financial-domain.md "Month headline decision")
 * calc.ts getCategoryTotals (fixed category order, ties, > 0 filter)
 *     -> CategoryTotalsTests
 * </pre>
 */
class FinancialCalculatorTest {

  private static final UUID HOUSEHOLD = UUID.randomUUID();
  private static final UUID MONTH_ID = UUID.randomUUID();
  private static final YearMonth AUGUST = YearMonth.of(2026, 8);

  private static final UUID ANA_ID = UUID.randomUUID();
  private static final UUID RAFAEL_ID = UUID.randomUUID();
  private static final UUID BETO_ID = UUID.randomUUID();

  /** Exactly calc.invariants.test.ts's fixture: Ana (VIEW_ME), Rafael (VIEW_SPOUSE), Beto (3rd profile). */
  private static FinancialProfile ana() {
    return new FinancialProfile(ANA_ID, HOUSEHOLD, "Ana", ProfileKind.HOUSEHOLD, 0, true);
  }

  private static FinancialProfile rafael() {
    return new FinancialProfile(RAFAEL_ID, HOUSEHOLD, "Rafael", ProfileKind.MANAGED, 1, true);
  }

  private static FinancialProfile beto() {
    return new FinancialProfile(BETO_ID, HOUSEHOLD, "Beto", ProfileKind.MANAGED, 2, true);
  }

  private static List<FinancialProfile> activeProfiles() {
    return List.of(ana(), rafael(), beto());
  }

  private static FinancialMonth augustMonth() {
    return new FinancialMonth(MONTH_ID, HOUSEHOLD, AUGUST, "Agosto 2026", Money.of("4000"), Money.of("1500"), false);
  }

  private static Map<UUID, Money> augustProfileBudgets() {
    return Map.of(BETO_ID, Money.of("400"));
  }

  private static FinancialEntry entry(
      UUID owner, String category, String amount, ExpenseStatus status, EntryType type, LocalDate date) {
    return new FinancialEntry(UUID.randomUUID(), owner, "Item", type, category, Money.of(amount), status, date, null);
  }

  private static FinancialEntry expense(UUID owner, String category, String amount, ExpenseStatus status) {
    return entry(owner, category, amount, status, EntryType.EXPENSE, LocalDate.of(2026, 8, 10));
  }

  /** a1, a2, r1, b1 from calc.invariants.test.ts's augustMonth(). */
  private static List<FinancialEntry> augustEntries() {
    return List.of(
        expense(ANA_ID, "Casa", "700", ExpenseStatus.PENDING),
        expense(ANA_ID, "Alimentação", "500", ExpenseStatus.PAID),
        expense(RAFAEL_ID, "Transporte", "300", ExpenseStatus.PAID),
        expense(BETO_ID, "Lazer", "100", ExpenseStatus.PAID));
  }

  @Nested
  class BudgetForViewTests {
    // calc.test.ts "budgetForView": month(income=5000, houseContribution=1200, profileBudgets={Convidado:300})
    private final FinancialMonth month =
        new FinancialMonth(MONTH_ID, HOUSEHOLD, AUGUST, "x", Money.of("5000"), Money.of("1200"), false);
    private final Map<UUID, Money> budgets = Map.of(UUID.randomUUID(), Money.of("300"));

    @Test
    void householdSumsIncomeAndHouseContribution() {
      Money budget = FinancialCalculator.budgetFor(new FinancialScope.Household(), month, budgets, null);
      assertThat(budget).isEqualTo(Money.of("6200"));
    }

    @Test
    void meReturnsIncome() {
      Money budget = FinancialCalculator.budgetFor(new FinancialScope.Me(), month, budgets, null);
      assertThat(budget).isEqualTo(Money.of("5000"));
    }

    @Test
    void secondPositionProfileReturnsHouseContributionEvenWithNoBudgetRow() {
      FinancialProfile spouse = new FinancialProfile(UUID.randomUUID(), HOUSEHOLD, "Rafael", ProfileKind.MANAGED, 1, true);
      Money budget = FinancialCalculator.budgetFor(new FinancialScope.Profile(spouse.id()), month, Map.of(), spouse);
      assertThat(budget).isEqualTo(Money.of("1200"));
    }

    @Test
    void thirdPlusPositionProfileReturnsItsOwnProfileBudgetsLookup() {
      UUID guestId = budgets.keySet().iterator().next();
      FinancialProfile guest = new FinancialProfile(guestId, HOUSEHOLD, "Convidado", ProfileKind.MANAGED, 2, true);
      Money budget = FinancialCalculator.budgetFor(new FinancialScope.Profile(guestId), month, budgets, guest);
      assertThat(budget).isEqualTo(Money.of("300"));
    }

    @Test
    void profileWithNoBudgetRowDefaultsToZero() {
      FinancialProfile noBudget = new FinancialProfile(UUID.randomUUID(), HOUSEHOLD, "Sem orçamento", ProfileKind.MANAGED, 3, true);
      Money budget = FinancialCalculator.budgetFor(new FinancialScope.Profile(noBudget.id()), month, Map.of(), noBudget);
      assertThat(budget).isEqualTo(Money.ZERO);
    }
  }

  @Nested
  class HouseholdFixtureTests {

    private FinancialSummary summarize(FinancialScope scope) {
      List<FinancialEntry> scoped = FinancialCalculator.entriesFor(scope, augustEntries(), activeProfiles());
      FinancialProfile resolved =
          scope instanceof FinancialScope.Profile(UUID id) ? activeProfiles().stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow() : null;
      Money budget = FinancialCalculator.budgetFor(scope, augustMonth(), augustProfileBudgets(), resolved);
      return FinancialCalculator.summarize(scope, AUGUST, budget, scoped);
    }

    @Test
    void householdTotalEqualsSumOfEachProfilesTotal() {
      Money householdTotal = summarize(new FinancialScope.Household()).total().value();
      Money anaTotal = summarize(new FinancialScope.Me()).total().value();
      Money rafaelTotal = summarize(new FinancialScope.Profile(RAFAEL_ID)).total().value();
      Money betoTotal = summarize(new FinancialScope.Profile(BETO_ID)).total().value();

      assertThat(householdTotal).isEqualTo(anaTotal.add(rafaelTotal).add(betoTotal));
      assertThat(householdTotal).isEqualTo(Money.of("1600"));
    }

    @Test
    void eachProfileSeesOnlyItsOwnExpenses() {
      List<FinancialEntry> anaEntries = FinancialCalculator.entriesFor(new FinancialScope.Me(), augustEntries(), activeProfiles());
      assertThat(anaEntries).extracting(FinancialEntry::ownerProfileId).containsOnly(ANA_ID);

      List<FinancialEntry> rafaelEntries =
          FinancialCalculator.entriesFor(new FinancialScope.Profile(RAFAEL_ID), augustEntries(), activeProfiles());
      assertThat(rafaelEntries).extracting(FinancialEntry::ownerProfileId).containsOnly(RAFAEL_ID);

      List<FinancialEntry> betoEntries =
          FinancialCalculator.entriesFor(new FinancialScope.Profile(BETO_ID), augustEntries(), activeProfiles());
      assertThat(betoEntries).extracting(FinancialEntry::ownerProfileId).containsOnly(BETO_ID);
    }

    @Test
    void thirdProfileExpensesCountInHouseholdTotalButNotInHouseholdBudget() {
      FinancialSummary household = summarize(new FinancialScope.Household());
      assertThat(household.total().value()).isEqualTo(Money.of("1600")); // includes Beto's 100
      assertThat(household.budget().value()).isEqualTo(Money.of("5500")); // income+houseContribution, Beto's 400 excluded
      assertThat(household.budget().value()).isNotEqualTo(Money.of("5900"));
    }

    @Test
    void categoryTotalsSumEqualsTotalForHousehold() {
      FinancialSummary household = summarize(new FinancialScope.Household());
      List<FinancialEntry> scoped = FinancialCalculator.entriesFor(new FinancialScope.Household(), augustEntries(), activeProfiles());
      Money categorySum =
          FinancialCalculator.categoryTotals(
                  scoped.stream().filter(e -> e.type() != EntryType.INCOME).toList())
              .stream()
              .map(CategoryTotal::total)
              .reduce(Money.ZERO, Money::add);
      assertThat(categorySum).isEqualTo(household.total().value());
    }

    @Test
    void categoryTotalsSumEqualsTotalForASingleProfile() {
      FinancialSummary ana = summarize(new FinancialScope.Me());
      List<FinancialEntry> scoped = FinancialCalculator.entriesFor(new FinancialScope.Me(), augustEntries(), activeProfiles());
      Money categorySum =
          FinancialCalculator.categoryTotals(
                  scoped.stream().filter(e -> e.type() != EntryType.INCOME).toList())
              .stream()
              .map(CategoryTotal::total)
              .reduce(Money.ZERO, Money::add);
      assertThat(categorySum).isEqualTo(ana.total().value());
    }

    // calc.test.ts "calc" describe block, ported as a Household-scope, single-owner fixture.
    @Test
    void calcComputesTotalsPaidPendingFreeAndTopCategory() {
      UUID owner = UUID.randomUUID();
      FinancialMonth month = new FinancialMonth(MONTH_ID, HOUSEHOLD, YearMonth.of(2026, 7), "x", Money.of("5000"), Money.of("1000"), false);
      List<FinancialEntry> entries =
          List.of(
              expense(owner, "Alimentação", "200", ExpenseStatus.PAID),
              expense(owner, "Alimentação", "300", ExpenseStatus.PENDING),
              entry(owner, "Outros", "150", ExpenseStatus.PAID, EntryType.INCOME, LocalDate.of(2026, 7, 1)));

      Money budget = FinancialCalculator.budgetFor(new FinancialScope.Household(), month, Map.of(), null);
      FinancialSummary result = FinancialCalculator.summarize(new FinancialScope.Household(), YearMonth.of(2026, 7), budget, entries);

      assertThat(result.total().value()).isEqualTo(Money.of("500")); // income entry excluded
      assertThat(result.paid().value()).isEqualTo(Money.of("200"));
      assertThat(result.pending().value()).isEqualTo(Money.of("300"));
      assertThat(result.received().value()).isEqualTo(Money.of("150"));
      assertThat(result.budget().value()).isEqualTo(Money.of("6000"));
      assertThat(result.free().value()).isEqualTo(Money.of("5500"));
      assertThat(result.topCategory()).isPresent();
      assertThat(result.topCategory().get()).isEqualTo(new CategoryTotal("Alimentação", Money.of("500")));
    }
  }

  @Nested
  class CategoryTotalsTests {

    @Test
    void excludesIncomeEntries() {
      UUID owner = UUID.randomUUID();
      List<FinancialEntry> entries =
          List.of(
              expense(owner, "Lazer", "100", ExpenseStatus.PAID),
              entry(owner, "Lazer", "9999", ExpenseStatus.PAID, EntryType.INCOME, LocalDate.of(2026, 8, 1)));
      List<CategoryTotal> totals = FinancialCalculator.categoryTotals(entries.stream().filter(e -> e.type() != EntryType.INCOME).toList());
      assertThat(totals).containsExactly(new CategoryTotal("Lazer", Money.of("100")));
    }

    @Test
    void dropsCategoriesWithExactlyZeroTotal() {
      // No entries at all -> every category totals exactly 0 -> all dropped (strictly > 0 filter).
      assertThat(FinancialCalculator.categoryTotals(List.of())).isEmpty();
    }

    @Test
    void sortsDescendingByTotal() {
      UUID owner = UUID.randomUUID();
      List<FinancialEntry> entries =
          List.of(
              expense(owner, "Lazer", "50", ExpenseStatus.PAID),
              expense(owner, "Casa", "200", ExpenseStatus.PAID),
              expense(owner, "Transporte", "100", ExpenseStatus.PAID));
      List<CategoryTotal> totals = FinancialCalculator.categoryTotals(entries);
      assertThat(totals).extracting(CategoryTotal::category).containsExactly("Casa", "Transporte", "Lazer");
    }

    @Test
    void tiedTotalsKeepTheCategoryDeclarationOrderStableSort() {
      // Categories.ORDER declares Transporte before Casa; both total 100 here — a stable sort
      // must keep Transporte first, matching JS's stable Array.sort over the same declared order.
      UUID owner = UUID.randomUUID();
      List<FinancialEntry> entries =
          List.of(expense(owner, "Casa", "100", ExpenseStatus.PAID), expense(owner, "Transporte", "100", ExpenseStatus.PAID));
      List<CategoryTotal> totals = FinancialCalculator.categoryTotals(entries);
      assertThat(totals).extracting(CategoryTotal::category).containsExactly("Transporte", "Casa");
    }
  }

  /** P3-FINANCIAL-TOOLS — {@code get_goals}' scope filter. Same "position, not kind" rule as {@code EntriesForTests}. */
  @Nested
  class PrioritiesForTests {

    private com.aval.finance.goals.Priority priority(UUID profileId, String description) {
      return new com.aval.finance.goals.Priority(
          UUID.randomUUID(),
          HOUSEHOLD,
          MONTH_ID,
          profileId,
          description,
          Money.of("1000"),
          Money.of("400"),
          2,
          com.aval.finance.goals.PriorityStatus.PENDING);
    }

    @Test
    void householdScopeIncludesEveryPriorityRegardlessOfOwner() {
      List<com.aval.finance.goals.Priority> all =
          List.of(priority(ANA_ID, "Viagem"), priority(RAFAEL_ID, "Curso"), priority(BETO_ID, "Bike"));
      List<com.aval.finance.goals.Priority> result =
          FinancialCalculator.prioritiesFor(new FinancialScope.Household(), all, activeProfiles());
      assertThat(result).hasSize(3);
    }

    @Test
    void meScopeMatchesOnlyTheSortOrderZeroProfileNeverByName() {
      List<com.aval.finance.goals.Priority> all = List.of(priority(ANA_ID, "Viagem"), priority(RAFAEL_ID, "Curso"));
      List<com.aval.finance.goals.Priority> result =
          FinancialCalculator.prioritiesFor(new FinancialScope.Me(), all, activeProfiles());
      assertThat(result).extracting(com.aval.finance.goals.Priority::description).containsExactly("Viagem");
    }

    @Test
    void profileScopeMatchesTheExactProfileIdNoPositionalIndirection() {
      List<com.aval.finance.goals.Priority> all = List.of(priority(ANA_ID, "Viagem"), priority(BETO_ID, "Bike"));
      List<com.aval.finance.goals.Priority> result =
          FinancialCalculator.prioritiesFor(new FinancialScope.Profile(BETO_ID), all, activeProfiles());
      assertThat(result).extracting(com.aval.finance.goals.Priority::description).containsExactly("Bike");
    }
  }
}
