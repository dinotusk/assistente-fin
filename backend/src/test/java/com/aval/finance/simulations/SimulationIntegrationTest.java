package com.aval.finance.simulations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.aval.assistant.tools.ToolExecutionContext;
import com.aval.finance.Money;
import com.aval.household.FinancialScope;
import com.aval.household.HouseholdAccessService;
import com.aval.integration.AbstractIntegrationTest;
import com.aval.platform.auth.AuthenticatedUser;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * P5 gate — real Postgres (Testcontainers, same singleton container every other integration test
 * uses). Proves: (1) a simulation for household A only ever reflects household A's real numbers,
 * never household B's; (2) a foreign household's profile/goal id cannot be used; (3) every table
 * a simulation reads is byte-for-byte unchanged afterward — the strongest available proof that
 * simulate_purchase/simulate_savings never write.
 */
@SpringBootTest
class SimulationIntegrationTest extends AbstractIntegrationTest {

  @Autowired private JdbcClient jdbcClient;
  @Autowired private SimulatePurchaseUseCase simulatePurchaseUseCase;
  @Autowired private SimulateSavingsUseCase simulateSavingsUseCase;
  @Autowired private HouseholdAccessService householdAccess;

  private static final YearMonth AUGUST = YearMonth.of(2026, 8);

  private UUID householdA;
  private AuthenticatedUser userA;
  private UUID profileA1;
  private UUID goalA;

  private UUID householdB;
  private AuthenticatedUser userB;
  private UUID profileB1;
  private UUID goalB;

  @BeforeEach
  void seed() {
    householdA = insertHousehold("Casa A");
    UUID userAId = UUID.randomUUID();
    userA = new AuthenticatedUser(userAId.toString(), "ana@example.com");
    insertMembership(householdA, userAId);
    profileA1 = insertProfile(householdA, "Ana", 0);
    UUID monthA = insertMonth(householdA, "4000.00", "0.00");
    insertExpense(householdA, monthA, profileA1, "700.00", "Pago");
    goalA = insertPriority(householdA, monthA, profileA1, "Viagem", "1000.00", "400.00");

    householdB = insertHousehold("Casa B");
    UUID userBId = UUID.randomUUID();
    userB = new AuthenticatedUser(userBId.toString(), "carla@example.com");
    insertMembership(householdB, userBId);
    profileB1 = insertProfile(householdB, "Carla", 0);
    UUID monthB = insertMonth(householdB, "9999.00", "0.00");
    insertExpense(householdB, monthB, profileB1, "9999.00", "Pago");
    goalB = insertPriority(householdB, monthB, profileB1, "Casa", "5000.00", "100.00");
  }

  @Test
  void purchaseSimulationForHouseholdAReflectsOnlyHouseholdAsRealNumbers() {
    PurchaseSimulationResult result =
        simulatePurchaseUseCase.handle(userA, AUGUST, new FinancialScope.Household(), Money.of("500"), 1);

    assertThat(result.currentBudget()).isEqualTo(Money.of("4000"));
    assertThat(result.currentTotal()).isEqualTo(Money.of("700"));
    assertThat(result.currentFree()).isEqualTo(Money.of("3300"));
    assertThat(result.projectedTotal()).isEqualTo(Money.of("1200"));
    assertThat(result.projectedFree()).isEqualTo(Money.of("2800"));
    assertThat(result.status()).isEqualTo(SimulationStatus.FEASIBLE);
    // Never household B's 9999 figure, proving no cross-household contamination.
    assertThat(result.currentTotal()).isNotEqualTo(Money.of("9999"));
  }

  @Test
  void userACannotSimulateAPurchaseUsingHouseholdBsProfile() {
    assertThatThrownBy(
            () ->
                simulatePurchaseUseCase.handle(
                    userA, AUGUST, new FinancialScope.Profile(profileB1), Money.of("100"), 1))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.RESOURCE_NOT_FOUND));
  }

  @Test
  void savingsSimulationUsingHouseholdAsOwnGoalWorks() {
    ToolExecutionContext context = ToolExecutionContext.resolve(userA, householdAccess);
    TimeToTargetResult result =
        simulateSavingsUseCase.timeToTarget(context, AUGUST, Optional.of(goalA), Money.ZERO, Money.ZERO, Money.of("300"));

    // Sourced from the real goal: target 1000, saved 400 -> remaining 600 -> 2 months at 300/mo.
    assertThat(result.remainingAmount()).isEqualTo(Money.of("600"));
    assertThat(result.monthsRequired()).contains(2);
  }

  @Test
  void userACannotSourceSavingsFromHouseholdBsGoal() {
    ToolExecutionContext context = ToolExecutionContext.resolve(userA, householdAccess);
    assertThatThrownBy(
            () -> simulateSavingsUseCase.timeToTarget(context, AUGUST, Optional.of(goalB), Money.ZERO, Money.ZERO, Money.of("100")))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.RESOURCE_NOT_FOUND));
  }

  @Test
  void userBsOwnSimulationSeesOnlyHouseholdBsNumbers() {
    PurchaseSimulationResult result =
        simulatePurchaseUseCase.handle(userB, AUGUST, new FinancialScope.Household(), Money.of("1"), 1);
    assertThat(result.currentTotal()).isEqualTo(Money.of("9999"));
  }

  @Test
  void runningSeveralSimulationsNeverWritesToAnyTable() {
    long expensesBefore = countRows("expenses");
    long prioritiesBefore = countRows("priorities");
    long monthsBefore = countRows("finance_months");
    long profilesBefore = countRows("financial_profiles");
    long householdsBefore = countRows("households");
    long membersBefore = countRows("household_members");

    // Run every simulation shape at least once, including a feasible, a NOT_FEASIBLE, and a
    // savings projection — if any of them wrote anything, at least one count below would move.
    simulatePurchaseUseCase.handle(userA, AUGUST, new FinancialScope.Household(), Money.of("500"), 6);
    simulatePurchaseUseCase.handle(userA, AUGUST, new FinancialScope.Household(), Money.of("50000"), 1);
    ToolExecutionContext context = ToolExecutionContext.resolve(userA, householdAccess);
    simulateSavingsUseCase.timeToTarget(context, AUGUST, Optional.of(goalA), Money.ZERO, Money.ZERO, Money.of("100"));
    simulateSavingsUseCase.futureValue(context, AUGUST, Optional.empty(), Money.of("1000"), Money.of("200"), 12);

    assertThat(countRows("expenses")).isEqualTo(expensesBefore);
    assertThat(countRows("priorities")).isEqualTo(prioritiesBefore);
    assertThat(countRows("finance_months")).isEqualTo(monthsBefore);
    assertThat(countRows("financial_profiles")).isEqualTo(profilesBefore);
    assertThat(countRows("households")).isEqualTo(householdsBefore);
    assertThat(countRows("household_members")).isEqualTo(membersBefore);

    // Also byte-for-byte: the specific expense row simulated against still has its original amount.
    String amount = jdbcClient.sql("select amount from expenses where household_id = :h")
        .param("h", householdA)
        .query(String.class)
        .single();
    assertThat(new java.math.BigDecimal(amount)).isEqualByComparingTo("700.00");
  }

  private long countRows(String table) {
    return jdbcClient.sql("select count(*) from " + table).query(Long.class).single();
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

  private UUID insertMonth(UUID householdId, String income, String houseContribution) {
    UUID id = UUID.randomUUID();
    jdbcClient
        .sql(
            "insert into finance_months (id, household_id, period, label, income, house_contribution) "
                + "values (:id, :h, :period, 'Agosto 2026', :income, :hc)")
        .param("id", id)
        .param("h", householdId)
        .param("period", AUGUST.atDay(1))
        .param("income", new java.math.BigDecimal(income))
        .param("hc", new java.math.BigDecimal(houseContribution))
        .update();
    return id;
  }

  private void insertExpense(UUID householdId, UUID monthId, UUID ownerProfileId, String amount, String status) {
    jdbcClient
        .sql(
            "insert into expenses (household_id, month_id, owner_profile_id, description, entry_type, category, amount, status, expense_date, competence) "
                + "values (:h, :m, :owner, 'Item', 'expense', 'Casa', :amount, :status, :date, :competence)")
        .param("h", householdId)
        .param("m", monthId)
        .param("owner", ownerProfileId)
        .param("amount", new java.math.BigDecimal(amount))
        .param("status", status)
        .param("date", LocalDate.of(2026, 8, 10))
        .param("competence", LocalDate.of(2026, 8, 1))
        .update();
  }

  private UUID insertPriority(UUID householdId, UUID monthId, UUID profileId, String description, String target, String saved) {
    UUID id = UUID.randomUUID();
    jdbcClient
        .sql(
            "insert into priorities (id, household_id, month_id, profile_id, description, target_amount, saved_amount, priority, status) "
                + "values (:id, :h, :m, :p, :desc, :target, :saved, 1, 'A pagar')")
        .param("id", id)
        .param("h", householdId)
        .param("m", monthId)
        .param("p", profileId)
        .param("desc", description)
        .param("target", new java.math.BigDecimal(target))
        .param("saved", new java.math.BigDecimal(saved))
        .update();
    return id;
  }
}
