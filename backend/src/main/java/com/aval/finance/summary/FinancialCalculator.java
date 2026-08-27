package com.aval.finance.summary;

import com.aval.finance.Categories;
import com.aval.finance.Money;
import com.aval.finance.budgets.FinancialMonth;
import com.aval.finance.expenses.EntryType;
import com.aval.finance.expenses.ExpenseStatus;
import com.aval.finance.expenses.FinancialEntry;
import com.aval.household.FinancialProfile;
import com.aval.household.FinancialScope;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Pure port of calc.ts's {@code budgetForView}/{@code expensesForView}/{@code calc}/{@code
 * getCategoryTotals} — no Spring, no I/O, JUnit-testable in isolation (Fase 40). Every method
 * takes already-loaded data; callers ({@code GetFinancialSummaryUseCase}) own fetching it.
 *
 * <p>Rule provenance for every branch is documented at the call site below and in
 * docs/architecture/financial-domain.md's parity matrix — nothing here reinterprets a TS rule;
 * ambiguous cases (no TS precedent for the exact input shape) are called out explicitly as such,
 * not silently resolved by whichever branch happened to be convenient.
 */
public final class FinancialCalculator {

  private FinancialCalculator() {}

  /**
   * calc.ts's {@code budgetForView}. {@link FinancialScope.Profile} resolves by the profile's
   * {@code sortOrder} — never by name — exactly reproducing the positional rule calc.ts encodes
   * via {@code people[index]}:
   *
   * <ul>
   *   <li>sortOrder 1 (the historical "spouse" position) → {@code houseContribution}.
   *   <li>any other position (0, or 2+) → the {@code profile_budgets} lookup, defaulting to
   *       zero. This also covers a scope=profile request for the sortOrder-0 profile — a call
   *       shape the PWA's UI never produces (it always uses {@link FinancialScope.Me} for that
   *       position instead), but which, if calc.ts's {@code budgetForView} were called with that
   *       profile's literal name instead of the {@code VIEW_ME} sentinel, would fall through to
   *       exactly this same profile-budget-lookup branch — so this is a faithful port of that
   *       specific (unexercised-by-the-UI) TS behavior, not a new invention.
   * </ul>
   */
  public static Money budgetFor(
      FinancialScope scope,
      FinancialMonth month,
      Map<UUID, Money> profileBudgets,
      FinancialProfile resolvedProfile) {
    return switch (scope) {
      case FinancialScope.Household ignored -> month.income().add(month.houseContribution());
      case FinancialScope.Me ignored -> month.income();
      case FinancialScope.Profile ignored ->
          resolvedProfile.sortOrder() == 1
              ? month.houseContribution()
              : profileBudgets.getOrDefault(resolvedProfile.id(), Money.ZERO);
    };
  }

  /**
   * calc.ts's {@code expensesForView}/{@code expenseMatchesView}. {@code Household} matches
   * everything (calc.ts: an unresolved owner — {@code VIEW_ALL} — always matches); {@code Me}
   * matches the sortOrder-0 profile's id; {@code Profile} matches that exact id directly, with
   * no positional indirection.
   */
  public static List<FinancialEntry> entriesFor(
      FinancialScope scope, List<FinancialEntry> allEntriesInMonth, List<FinancialProfile> activeProfilesBySortOrder) {
    return switch (scope) {
      case FinancialScope.Household ignored -> allEntriesInMonth;
      case FinancialScope.Me ignored -> {
        if (activeProfilesBySortOrder.isEmpty()) yield List.of();
        UUID meId = activeProfilesBySortOrder.get(0).id();
        yield allEntriesInMonth.stream().filter(e -> e.ownerProfileId().equals(meId)).toList();
      }
      case FinancialScope.Profile(UUID profileId) ->
          allEntriesInMonth.stream().filter(e -> e.ownerProfileId().equals(profileId)).toList();
    };
  }

  /** calc.ts's {@code calc()} — operates on the already scope-filtered entries from {@link #entriesFor}. */
  public static FinancialSummary summarize(
      FinancialScope scope, java.time.YearMonth monthKey, Money budget, List<FinancialEntry> scopedEntries) {
    List<FinancialEntry> expenses = scopedEntries.stream().filter(e -> e.type() != EntryType.INCOME).toList();
    Money received = sumAmounts(scopedEntries.stream().filter(e -> e.type() == EntryType.INCOME).toList());
    Money total = sumAmounts(expenses);
    Money pending = sumAmounts(expenses.stream().filter(e -> e.status() == ExpenseStatus.PENDING).toList());
    Money paid = sumAmounts(expenses.stream().filter(e -> e.status() == ExpenseStatus.PAID).toList());
    Money free = budget.subtract(total);
    List<CategoryTotal> byCategory = categoryTotals(expenses);
    Optional<CategoryTotal> topCategory = byCategory.isEmpty() ? Optional.empty() : Optional.of(byCategory.get(0));

    return new FinancialSummary(
        scope,
        monthKey,
        ProvenancedMoney.calculated(budget),
        ProvenancedMoney.calculated(total),
        ProvenancedMoney.calculated(paid),
        ProvenancedMoney.calculated(pending),
        ProvenancedMoney.calculated(received),
        ProvenancedMoney.calculated(free),
        topCategory);
  }

  /**
   * calc.ts's {@code getCategoryTotals}: income entries excluded, one total per category in
   * {@link Categories#ORDER}'s declared order, categories totalling exactly zero dropped
   * (strictly {@code > 0}, matching the TS filter), then a stable sort descending by total —
   * Java's {@link List#sort} (Collections.sort/TimSort) is stable, so ties keep the declared
   * category order, exactly mirroring JavaScript's (ES2019+) stable {@code Array.sort}.
   */
  public static List<CategoryTotal> categoryTotals(List<FinancialEntry> expenses) {
    List<CategoryTotal> totals =
        Categories.ORDER.stream()
            .map(
                category ->
                    new CategoryTotal(
                        category,
                        sumAmounts(expenses.stream().filter(e -> e.category().equals(category)).toList())))
            .filter(c -> c.total().isPositive())
            .collect(java.util.stream.Collectors.toCollection(java.util.ArrayList::new));
    totals.sort(Comparator.comparing(CategoryTotal::total, Money.descending()));
    return totals;
  }

  private static Money sumAmounts(List<FinancialEntry> entries) {
    Money total = Money.ZERO;
    for (FinancialEntry entry : entries) {
      total = total.add(entry.amount());
    }
    return total;
  }
}
