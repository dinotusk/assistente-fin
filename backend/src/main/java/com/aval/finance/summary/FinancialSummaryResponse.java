package com.aval.finance.summary;

import com.aval.household.FinancialScope;
import java.util.UUID;

/**
 * The wire shape for {@code GET /api/v1/financial-summary}. Money fields are JSON strings
 * ({@code "12200.00"}), never bare JSON numbers: a {@code numeric(14,2)} value round-tripped
 * through a JS/JSON consumer's IEEE-754 double can silently lose exact decimal precision (e.g.
 * {@code 12200.10} has no exact binary float representation) — a string sidesteps that entirely
 * and is the safer default for every consumer (PWA, future Expo app, future AI tool). See
 * docs/architecture/financial-domain.md "Money JSON representation".
 */
public record FinancialSummaryResponse(
    String month,
    ScopeResponse scope,
    MoneyResponse budget,
    MoneyResponse expenses,
    MoneyResponse paid,
    MoneyResponse pending,
    MoneyResponse received,
    MoneyResponse free,
    CategoryTotalResponse topCategory) {

  public record MoneyResponse(String value, String provenance) {}

  public record CategoryTotalResponse(String category, String value) {}

  public record ScopeResponse(String type, String profileId) {}

  public static FinancialSummaryResponse from(FinancialSummary summary) {
    return new FinancialSummaryResponse(
        summary.month().toString(),
        scopeOf(summary.scope()),
        moneyOf(summary.budget()),
        moneyOf(summary.total()),
        moneyOf(summary.paid()),
        moneyOf(summary.pending()),
        moneyOf(summary.received()),
        moneyOf(summary.free()),
        summary
            .topCategory()
            .map(c -> new CategoryTotalResponse(c.category(), c.total().value().toPlainString()))
            .orElse(null));
  }

  private static MoneyResponse moneyOf(ProvenancedMoney money) {
    return new MoneyResponse(money.value().value().toPlainString(), money.provenance().name());
  }

  private static ScopeResponse scopeOf(FinancialScope scope) {
    return switch (scope) {
      case FinancialScope.Household ignored -> new ScopeResponse("HOUSEHOLD", null);
      case FinancialScope.Me ignored -> new ScopeResponse("ME", null);
      case FinancialScope.Profile(UUID profileId) -> new ScopeResponse("PROFILE", profileId.toString());
    };
  }
}
