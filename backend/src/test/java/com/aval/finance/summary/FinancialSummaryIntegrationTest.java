package com.aval.finance.summary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.aval.finance.Money;
import com.aval.household.FinancialScope;
import com.aval.integration.AbstractIntegrationTest;
import com.aval.platform.auth.AuthenticatedUser;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Fase 32 — real Postgres (Testcontainers), real SQL, real household isolation. Seeds two
 * completely independent households (A: 3 profiles, income+houseContribution+profileBudget,
 * mixed expense/income/status rows; B: 1 profile, its own expense) and proves household B's data
 * is never visible to household A's user, and vice versa — not by inspecting queries, but by
 * calling the real use case end to end against the real database.
 */
@SpringBootTest
class FinancialSummaryIntegrationTest extends AbstractIntegrationTest {

  @Autowired private JdbcClient jdbcClient;
  @Autowired private GetFinancialSummaryUseCase useCase;

  private UUID householdA;
  private UUID userA;
  private UUID profileA1; // sortOrder 0 — "me"
  private UUID profileA2; // sortOrder 1 — "spouse"
  private UUID profileA3; // sortOrder 2 — named 3rd profile, has a profile_budgets row
  private UUID monthA;

  private UUID householdB;
  private UUID userB;
  private UUID profileB1;
  private UUID monthB;

  private static final YearMonth AUGUST = YearMonth.of(2026, 8);

  @BeforeEach
  void seedTwoIndependentHouseholds() {
    householdA = insertHousehold("Casa A");
    userA = UUID.randomUUID();
    insertMembership(householdA, userA);
    profileA1 = insertProfile(householdA, "Ana", 0);
    profileA2 = insertProfile(householdA, "Rafael", 1);
    profileA3 = insertProfile(householdA, "Beto", 2);
    monthA = insertMonth(householdA, "4000.00", "1500.00");
    insertProfileBudget(householdA, monthA, profileA3, "400.00");
    insertExpense(householdA, monthA, profileA1, "expense", "Casa", "700.00", "A pagar");
    insertExpense(householdA, monthA, profileA1, "expense", "Alimentação", "500.00", "Pago");
    insertExpense(householdA, monthA, profileA2, "expense", "Transporte", "300.00", "Pago");
    insertExpense(householdA, monthA, profileA3, "expense", "Lazer", "100.00", "Pago");

    householdB = insertHousehold("Casa B");
    userB = UUID.randomUUID();
    insertMembership(householdB, userB);
    profileB1 = insertProfile(householdB, "Carla", 0);
    monthB = insertMonth(householdB, "9999.00", "0.00");
    insertExpense(householdB, monthB, profileB1, "expense", "Saúde", "9999.00", "Pago");
  }

  @Test
  void householdScopeMatchesTheExactAugustFixtureNumbers() {
    FinancialSummary summary =
        useCase.handle(new AuthenticatedUser(userA.toString(), "ana@example.com"), AUGUST, new FinancialScope.Household());

    assertThat(summary.total().value()).isEqualTo(Money.of("1600"));
    assertThat(summary.budget().value()).isEqualTo(Money.of("5500")); // Beto's profileBudget excluded
    assertThat(summary.paid().value()).isEqualTo(Money.of("900"));
    assertThat(summary.pending().value()).isEqualTo(Money.of("700"));
    assertThat(summary.free().value()).isEqualTo(Money.of("3900"));
  }

  @Test
  void userBNeverSeesHouseholdAsData() {
    FinancialSummary summary =
        useCase.handle(new AuthenticatedUser(userB.toString(), "carla@example.com"), AUGUST, new FinancialScope.Household());

    // Household B's own total (9999, its single seeded expense) proves the query is genuinely
    // scoped to household B — not accidentally returning household A's 1600 total, and not
    // silently zero either (which could just as easily mean the query matched nothing at all).
    assertThat(summary.total().value()).isEqualTo(Money.of("9999"));
    assertThat(summary.paid().value()).isEqualTo(Money.of("9999"));
    assertThat(summary.budget().value()).isEqualTo(Money.of("9999"));
  }

  @Test
  void userACannotAccessHouseholdBsProfileEvenByGuessingItsRealId() {
    assertThatThrownBy(
            () ->
                useCase.handle(
                    new AuthenticatedUser(userA.toString(), "ana@example.com"),
                    AUGUST,
                    new FinancialScope.Profile(profileB1)))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.RESOURCE_NOT_FOUND));
  }

  @Test
  void userWithNoHouseholdMembershipGetsResourceNotFound() {
    String orphanUserId = UUID.randomUUID().toString();
    assertThatThrownBy(
            () -> useCase.handle(new AuthenticatedUser(orphanUserId, "ghost@example.com"), AUGUST, new FinancialScope.Household()))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.RESOURCE_NOT_FOUND));
  }

  @Test
  void monthThatDoesNotExistForThisHouseholdIsResourceNotFound() {
    assertThatThrownBy(
            () ->
                useCase.handle(
                    new AuthenticatedUser(userA.toString(), "ana@example.com"),
                    YearMonth.of(2020, 1),
                    new FinancialScope.Household()))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.RESOURCE_NOT_FOUND));
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

  private void insertProfileBudget(UUID householdId, UUID monthId, UUID profileId, String amount) {
    jdbcClient
        .sql("insert into profile_budgets (household_id, month_id, profile_id, amount) values (:h, :m, :p, :a)")
        .param("h", householdId)
        .param("m", monthId)
        .param("p", profileId)
        .param("a", new java.math.BigDecimal(amount))
        .update();
  }

  private void insertExpense(
      UUID householdId, UUID monthId, UUID ownerProfileId, String entryType, String category, String amount, String status) {
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
        .param("date", LocalDate.of(2026, 8, 10))
        .param("competence", AUGUST.atDay(1))
        .update();
  }
}
