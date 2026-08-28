package com.aval.assistant.tools;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.aval.finance.Money;
import com.aval.finance.Percent;
import com.aval.finance.expenses.EntryType;
import com.aval.finance.expenses.ExpensePage;
import com.aval.finance.expenses.ExpenseStatus;
import com.aval.finance.expenses.FinancialEntry;
import com.aval.finance.expenses.ListExpensesUseCase;
import com.aval.finance.goals.GetGoalsUseCase;
import com.aval.finance.goals.GoalView;
import com.aval.finance.summary.CompareMonthsUseCase;
import com.aval.finance.summary.MonthComparisonResult;
import com.aval.household.FinancialScope;
import com.aval.household.HouseholdAccessService;
import com.aval.integration.AbstractIntegrationTest;
import com.aval.platform.auth.AuthenticatedUser;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * P3-FINANCIAL-TOOLS gate — real Postgres (Testcontainers), real SQL, exercising the four new
 * tools (get_expenses, compare_months, get_goals; get_household_profiles is exercised indirectly
 * through {@link HouseholdAccessService#activeProfiles}, already proven by {@code
 * FinancialSummaryIntegrationTest}) end to end. Seeds the same two-household shape {@code
 * FinancialSummaryIntegrationTest} uses (A: Ana/Rafael/Beto; B: Carla) so household isolation is
 * proven against a household that is NOT trivially empty.
 */
@SpringBootTest
class FinancialToolsIntegrationTest extends AbstractIntegrationTest {

  @Autowired private JdbcClient jdbcClient;
  @Autowired private ListExpensesUseCase listExpensesUseCase;
  @Autowired private CompareMonthsUseCase compareMonthsUseCase;
  @Autowired private GetGoalsUseCase getGoalsUseCase;
  @Autowired private HouseholdAccessService householdAccess;

  private UUID householdA;
  private AuthenticatedUser userA;
  private UUID profileA1; // Ana, sortOrder 0 — "me"
  private UUID profileA2; // Rafael, sortOrder 1
  private UUID profileA3; // Beto, sortOrder 2
  private UUID monthAugustA;
  private UUID monthJulyA;

  private UUID householdB;
  private AuthenticatedUser userB;
  private UUID profileB1;
  private UUID monthAugustB;

  private static final YearMonth AUGUST = YearMonth.of(2026, 8);
  private static final YearMonth JULY = YearMonth.of(2026, 7);

  @BeforeEach
  void seedTwoIndependentHouseholds() {
    householdA = insertHousehold("Casa A");
    UUID userAId = UUID.randomUUID();
    userA = new AuthenticatedUser(userAId.toString(), "ana@example.com");
    insertMembership(householdA, userAId);
    profileA1 = insertProfile(householdA, "Ana", 0);
    profileA2 = insertProfile(householdA, "Rafael", 1);
    profileA3 = insertProfile(householdA, "Beto", 2);

    monthAugustA = insertMonth(householdA, AUGUST, "4000.00", "1500.00");
    insertExpense(householdA, monthAugustA, profileA1, "expense", "Casa", "700.00", "A pagar", LocalDate.of(2026, 8, 5));
    insertExpense(householdA, monthAugustA, profileA1, "expense", "Alimentação", "500.00", "Pago", LocalDate.of(2026, 8, 12));
    insertExpense(householdA, monthAugustA, profileA2, "expense", "Transporte", "300.00", "Pago", LocalDate.of(2026, 8, 3));
    insertExpense(householdA, monthAugustA, profileA3, "expense", "Lazer", "100.00", "Pago", LocalDate.of(2026, 8, 20));
    insertExpense(householdA, monthAugustA, profileA1, "income", "Outros", "200.00", "Pago", LocalDate.of(2026, 8, 1));

    monthJulyA = insertMonth(householdA, JULY, "4000.00", "1500.00");
    insertExpense(householdA, monthJulyA, profileA1, "expense", "Casa", "400.00", "Pago", LocalDate.of(2026, 7, 5));

    insertPriority(householdA, monthAugustA, profileA1, "Viagem", "1000.00", "400.00", 1, "A pagar");
    insertPriority(householdA, monthAugustA, profileA2, "Emergência", "500.00", "500.00", 1, "A pagar");
    insertPriority(householdA, monthAugustA, profileA3, "Curso", "300.00", "500.00", 2, "A pagar");
    insertPriority(householdA, monthAugustA, profileA1, "Sonho", "0.00", "0.00", 3, "Adiar");

    householdB = insertHousehold("Casa B");
    UUID userBId = UUID.randomUUID();
    userB = new AuthenticatedUser(userBId.toString(), "carla@example.com");
    insertMembership(householdB, userBId);
    profileB1 = insertProfile(householdB, "Carla", 0);
    monthAugustB = insertMonth(householdB, AUGUST, "9999.00", "0.00");
    insertExpense(householdB, monthAugustB, profileB1, "expense", "Saúde", "9999.00", "Pago", LocalDate.of(2026, 8, 10));
    insertPriority(householdB, monthAugustB, profileB1, "Casa própria", "1000.00", "100.00", 1, "A pagar");
  }

  @Nested
  class GetExpenses {

    @Test
    void householdScopeReturnsEveryEntryOrderedMostRecentFirst() {
      ExpensePage page =
          listExpensesUseCase.handle(
              context(userA, householdA), AUGUST, new FinancialScope.Household(), Optional.empty(), Optional.empty(), Optional.empty(), 0, 50);

      assertThat(page.items()).hasSize(5);
      assertThat(page.items().get(0).expenseDate()).isEqualTo(LocalDate.of(2026, 8, 20)); // Beto's Lazer, most recent
      assertThat(page.hasMore()).isFalse();
    }

    @Test
    void entryTypeFilterSeparatesIncomeFromExpenseNeverCountingIncomeAsAGasto() {
      ExpensePage income =
          listExpensesUseCase.handle(
              context(userA, householdA), AUGUST, new FinancialScope.Household(), Optional.empty(), Optional.empty(), Optional.of(EntryType.INCOME), 0, 50);
      assertThat(income.items()).hasSize(1);
      assertThat(income.items().get(0).type()).isEqualTo(EntryType.INCOME);

      ExpensePage expenses =
          listExpensesUseCase.handle(
              context(userA, householdA), AUGUST, new FinancialScope.Household(), Optional.empty(), Optional.empty(), Optional.of(EntryType.EXPENSE), 0, 50);
      assertThat(expenses.items()).hasSize(4);
    }

    @Test
    void meScopeMatchesOnlyTheSortOrderZeroProfile() {
      ExpensePage page =
          listExpensesUseCase.handle(
              context(userA, householdA), AUGUST, new FinancialScope.Me(), Optional.empty(), Optional.empty(), Optional.empty(), 0, 50);
      // Ana (sortOrder 0) owns 2 expense rows + 1 income row = 3.
      assertThat(page.items()).hasSize(3);
      assertThat(page.items()).allMatch(e -> e.ownerProfileId().equals(profileA1));
    }

    @Test
    void categoryFilterNarrowsWithinTheHousehold() {
      ExpensePage page =
          listExpensesUseCase.handle(
              context(userA, householdA), AUGUST, new FinancialScope.Household(), Optional.of("Transporte"), Optional.empty(), Optional.empty(), 0, 50);
      assertThat(page.items()).extracting(FinancialEntry::category).containsExactly("Transporte");
    }

    @Test
    void statusFilterNarrowsToPendingOnly() {
      ExpensePage page =
          listExpensesUseCase.handle(
              context(userA, householdA), AUGUST, new FinancialScope.Household(), Optional.empty(), Optional.of(ExpenseStatus.PENDING), Optional.empty(), 0, 50);
      assertThat(page.items()).hasSize(1);
      assertThat(page.items().get(0).category()).isEqualTo("Casa");
    }

    @Test
    void paginationReportsHasMoreWithoutOffByOne() {
      ExpensePage firstPage =
          listExpensesUseCase.handle(
              context(userA, householdA), AUGUST, new FinancialScope.Household(), Optional.empty(), Optional.empty(), Optional.empty(), 0, 2);
      assertThat(firstPage.items()).hasSize(2);
      assertThat(firstPage.hasMore()).isTrue();

      ExpensePage lastPage =
          listExpensesUseCase.handle(
              context(userA, householdA), AUGUST, new FinancialScope.Household(), Optional.empty(), Optional.empty(), Optional.empty(), 2, 2);
      assertThat(lastPage.items()).hasSize(1);
      assertThat(lastPage.hasMore()).isFalse();
    }

    @Test
    void userANeverSeesHouseholdBsExpenses() {
      ExpensePage page =
          listExpensesUseCase.handle(
              context(userA, householdA), AUGUST, new FinancialScope.Household(), Optional.empty(), Optional.empty(), Optional.empty(), 0, 50);
      assertThat(page.items()).noneMatch(e -> e.amount().equals(Money.of("9999")));
    }

    @Test
    void userACannotUseHouseholdBsProfileIdAsAScopeFilter() {
      assertThatThrownBy(
              () ->
                  listExpensesUseCase.handle(
                      context(userA, householdA), AUGUST, new FinancialScope.Profile(profileB1), Optional.empty(), Optional.empty(), Optional.empty(), 0, 50))
          .isInstanceOf(ApiException.class)
          .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.RESOURCE_NOT_FOUND));
    }
  }

  @Nested
  class GetGoals {

    @Test
    void targetGreaterThanSavedHasPartialProgress() {
      List<GoalView> goals =
          getGoalsUseCase.handle(context(userA, householdA), AUGUST, new FinancialScope.Profile(profileA1)).stream()
              .filter(g -> g.priority().description().equals("Viagem"))
              .toList();
      assertThat(goals).hasSize(1);
      assertThat(goals.get(0).remaining()).isEqualTo(Money.of("600"));
      assertThat(goals.get(0).progress()).isEqualTo(new Percent.Value(new java.math.BigDecimal("40.00")));
    }

    @Test
    void savedEqualsTargetIsFullProgressZeroRemaining() {
      List<GoalView> goals = getGoalsUseCase.handle(context(userA, householdA), AUGUST, new FinancialScope.Profile(profileA2));
      assertThat(goals).hasSize(1);
      assertThat(goals.get(0).remaining()).isEqualTo(Money.ZERO);
      assertThat(goals.get(0).progress()).isEqualTo(new Percent.Value(new java.math.BigDecimal("100.00")));
    }

    @Test
    void savedGreaterThanTargetCapsProgressAtOneHundred() {
      List<GoalView> goals = getGoalsUseCase.handle(context(userA, householdA), AUGUST, new FinancialScope.Profile(profileA3));
      assertThat(goals).hasSize(1);
      assertThat(goals.get(0).remaining()).isEqualTo(Money.ZERO);
      assertThat(goals.get(0).progress()).isEqualTo(new Percent.Value(new java.math.BigDecimal("100.00")));
    }

    @Test
    void zeroTargetGoalHasExplicitZeroProgressNeverNotApplicable() {
      List<GoalView> goals =
          getGoalsUseCase.handle(context(userA, householdA), AUGUST, new FinancialScope.Profile(profileA1)).stream()
              .filter(g -> g.priority().description().equals("Sonho"))
              .toList();
      assertThat(goals).hasSize(1);
      assertThat(goals.get(0).progress()).isEqualTo(new Percent.Value(new java.math.BigDecimal("0.00")));
    }

    @Test
    void householdScopeIncludesAllFourOfHouseholdAsGoalsNeverHouseholdBs() {
      List<GoalView> goals = getGoalsUseCase.handle(context(userA, householdA), AUGUST, new FinancialScope.Household());
      assertThat(goals).hasSize(4);
      assertThat(goals).noneMatch(g -> g.priority().description().equals("Casa própria"));
    }

    @Test
    void aHouseholdWithNoGoalsReturnsAnEmptyListNeverAnError() {
      List<GoalView> goals = getGoalsUseCase.handle(context(userA, householdA), JULY, new FinancialScope.Household());
      assertThat(goals).isEmpty();
    }

    @Test
    void userACannotUseHouseholdBsProfileIdToReadGoals() {
      assertThatThrownBy(() -> getGoalsUseCase.handle(context(userA, householdA), AUGUST, new FinancialScope.Profile(profileB1)))
          .isInstanceOf(ApiException.class)
          .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.RESOURCE_NOT_FOUND));
    }
  }

  @Nested
  class CompareMonths {

    @Test
    void increaseFromJulyToAugustComputesTheRealDeltaAndPercent() {
      MonthComparisonResult result =
          compareMonthsUseCase.handle(context(userA, householdA), JULY, AUGUST, new FinancialScope.Household());

      // July total = 400 (one expense); August total = 1600 (same fixture as FinancialSummaryIntegrationTest).
      assertThat(result.monthA().total().value()).isEqualTo(Money.of("400"));
      assertThat(result.monthB().total().value()).isEqualTo(Money.of("1600"));
      assertThat(result.expensesDelta()).isEqualTo(Money.of("1200"));
      assertThat(result.expensesDeltaPercent()).isEqualTo(new Percent.Value(new java.math.BigDecimal("300.00")));
    }

    @Test
    void categoryOnlyPresentInAugustIsANotApplicablePercentSinceJulyBaselineIsZeroForIt() {
      MonthComparisonResult result =
          compareMonthsUseCase.handle(context(userA, householdA), JULY, AUGUST, new FinancialScope.Household());
      var alimentacao = result.categoryDeltas().stream().filter(c -> c.category().equals("Alimentação")).findFirst().orElseThrow();
      assertThat(alimentacao.totalA()).isEqualTo(Money.ZERO);
      assertThat(alimentacao.totalB()).isEqualTo(Money.of("500"));
      assertThat(alimentacao.deltaPercent()).isEqualTo(new Percent.NotApplicable());
    }

    @Test
    void neverMixesHouseholdBsDataIntoUserAsComparison() {
      MonthComparisonResult result =
          compareMonthsUseCase.handle(context(userA, householdA), JULY, AUGUST, new FinancialScope.Household());
      assertThat(result.monthB().total().value()).isNotEqualTo(Money.of("9999"));
    }

    @Test
    void userBsOwnComparisonSeesOnlyHouseholdBsNumbers() {
      MonthComparisonResult result =
          compareMonthsUseCase.handle(context(userB, householdB), AUGUST, AUGUST, new FinancialScope.Household());
      assertThat(result.monthA().total().value()).isEqualTo(Money.of("9999"));
      assertThat(result.expensesDelta()).isEqualTo(Money.ZERO);
    }
  }

  @Nested
  class GetHouseholdProfiles {

    @Test
    void returnsOnlyHouseholdAsProfilesOrderedBySortOrder() {
      List<com.aval.household.FinancialProfile> profiles = householdAccess.activeProfiles(householdA);
      assertThat(profiles).extracting(com.aval.household.FinancialProfile::name).containsExactly("Ana", "Rafael", "Beto");
    }

    @Test
    void neverReturnsHouseholdBsProfiles() {
      List<com.aval.household.FinancialProfile> profiles = householdAccess.activeProfiles(householdA);
      assertThat(profiles).noneMatch(p -> p.name().equals("Carla"));
    }
  }

  private ToolExecutionContext context(AuthenticatedUser user, UUID expectedHouseholdId) {
    ToolExecutionContext context = ToolExecutionContext.resolve(user, householdAccess);
    assertThat(context.householdId()).isEqualTo(expectedHouseholdId);
    return context;
  }

  private UUID insertHousehold(String name) {
    UUID id = UUID.randomUUID();
    jdbcClient.sql("insert into households (id, name) values (:id, :name)").param("id", id).param("name", name).update();
    return id;
  }

  private void insertMembership(UUID householdId, UUID userId) {
    jdbcClient
        .sql("insert into household_members (household_id, user_id) values (:h, :u)")
        .param("h", householdId)
        .param("u", userId)
        .update();
  }

  private UUID insertProfile(UUID householdId, String name, int sortOrder) {
    UUID id = UUID.randomUUID();
    jdbcClient
        .sql("insert into financial_profiles (id, household_id, name, sort_order) values (:id, :h, :name, :sort)")
        .param("id", id)
        .param("h", householdId)
        .param("name", name)
        .param("sort", sortOrder)
        .update();
    return id;
  }

  private UUID insertMonth(UUID householdId, YearMonth period, String income, String houseContribution) {
    UUID id = UUID.randomUUID();
    jdbcClient
        .sql(
            "insert into finance_months (id, household_id, period, label, income, house_contribution) "
                + "values (:id, :h, :period, :label, :income, :hc)")
        .param("id", id)
        .param("h", householdId)
        .param("period", period.atDay(1))
        .param("label", period.toString())
        .param("income", new java.math.BigDecimal(income))
        .param("hc", new java.math.BigDecimal(houseContribution))
        .update();
    return id;
  }

  private void insertExpense(
      UUID householdId, UUID monthId, UUID ownerProfileId, String entryType, String category, String amount, String status, LocalDate date) {
    jdbcClient
        .sql(
            "insert into expenses (household_id, month_id, owner_profile_id, description, entry_type, category, amount, status, expense_date, competence) "
                + "values (:h, :m, :owner, 'Item', :type, :cat, :amount, :status, :date, :competence)")
        .param("h", householdId)
        .param("m", monthId)
        .param("owner", ownerProfileId)
        .param("type", entryType)
        .param("cat", category)
        .param("amount", new java.math.BigDecimal(amount))
        .param("status", status)
        .param("date", date)
        .param("competence", date.withDayOfMonth(1))
        .update();
  }

  private void insertPriority(
      UUID householdId, UUID monthId, UUID profileId, String description, String target, String saved, int rank, String status) {
    jdbcClient
        .sql(
            "insert into priorities (household_id, month_id, profile_id, description, target_amount, saved_amount, priority, status) "
                + "values (:h, :m, :p, :desc, :target, :saved, :rank, :status)")
        .param("h", householdId)
        .param("m", monthId)
        .param("p", profileId)
        .param("desc", description)
        .param("target", new java.math.BigDecimal(target))
        .param("saved", new java.math.BigDecimal(saved))
        .param("rank", rank)
        .param("status", status)
        .update();
  }
}
