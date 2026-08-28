package com.aval.finance.expenses;

import com.aval.assistant.tools.ToolExecutionContext;
import com.aval.finance.budgets.FinancialMonth;
import com.aval.finance.budgets.FinancialMonthRepository;
import com.aval.household.FinancialProfile;
import com.aval.household.FinancialScope;
import com.aval.household.HouseholdAccessService;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Orchestrates {@code get_expenses}: resolve tenancy → resolve month → resolve the scope to an
 * (optional) owner profile filter → query. The filter-to-profile-id resolution reuses the exact
 * "position, not kind" rule {@code FinancialCalculator#entriesFor} already encodes — see {@link
 * #resolveOwnerFilter} — so this tool can never drift from how {@code get_financial_summary}
 * resolves the same scope.
 */
@Service
public class ListExpensesUseCase {

  private final HouseholdAccessService householdAccess;
  private final FinancialMonthRepository monthRepository;
  private final ExpenseRepository expenseRepository;

  public ListExpensesUseCase(
      HouseholdAccessService householdAccess,
      FinancialMonthRepository monthRepository,
      ExpenseRepository expenseRepository) {
    this.householdAccess = householdAccess;
    this.monthRepository = monthRepository;
    this.expenseRepository = expenseRepository;
  }

  public ExpensePage handle(
      ToolExecutionContext context,
      YearMonth month,
      FinancialScope scope,
      Optional<String> category,
      Optional<ExpenseStatus> status,
      Optional<EntryType> entryType,
      int page,
      int pageSize) {
    UUID householdId = context.householdId();

    FinancialMonth financialMonth =
        monthRepository
            .findByHouseholdAndPeriod(householdId, month)
            .orElseThrow(
                () -> new ApiException(ApiErrorType.RESOURCE_NOT_FOUND, "Mês financeiro não encontrado."));

    Optional<UUID> ownerFilter = resolveOwnerFilter(householdId, scope);

    ExpenseSearchCriteria criteria =
        new ExpenseSearchCriteria(
            householdId, financialMonth.id(), ownerFilter, category, status, entryType, page * pageSize, pageSize);

    List<FinancialEntry> fetched = expenseRepository.search(criteria);
    return ExpensePage.of(fetched, page, pageSize);
  }

  /**
   * {@code Household} → no owner filter (matches every profile, exactly like {@code
   * entriesFor}'s {@code Household} branch); {@code Me} → the sortOrder-0 profile's id; {@code
   * Profile} → that exact id, validated against this household first (never leaking whether a
   * foreign household's profile id exists).
   */
  private Optional<UUID> resolveOwnerFilter(UUID householdId, FinancialScope scope) {
    return switch (scope) {
      case FinancialScope.Household ignored -> Optional.empty();
      case FinancialScope.Me ignored -> {
        List<FinancialProfile> activeProfiles = householdAccess.activeProfiles(householdId);
        yield activeProfiles.isEmpty() ? Optional.of(UUID_THAT_MATCHES_NOTHING) : Optional.of(activeProfiles.get(0).id());
      }
      case FinancialScope.Profile(UUID profileId) -> {
        householdAccess.resolveProfile(householdId, profileId);
        yield Optional.of(profileId);
      }
    };
  }

  // No active profiles for this household (should not happen in practice — every household is
  // bootstrapped with at least one) — filter to an id that can never match a real row, rather
  // than silently falling back to Household's "no filter" behavior for a scope=me request.
  private static final UUID UUID_THAT_MATCHES_NOTHING = new UUID(0L, 0L);
}
