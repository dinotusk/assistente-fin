package com.aval.finance.simulations;

import com.aval.finance.Money;
import com.aval.finance.summary.FinancialSummary;
import com.aval.finance.summary.GetFinancialSummaryUseCase;
import com.aval.household.FinancialScope;
import com.aval.platform.auth.AuthenticatedUser;
import java.time.YearMonth;
import org.springframework.stereotype.Service;

/**
 * Orchestrates {@code simulate_purchase}: reuses {@link GetFinancialSummaryUseCase} (P2/P3,
 * unmodified) for the real, tenancy-checked {@code budget}/{@code total}/{@code free} of the
 * requested month/scope, then hands those three numbers to the pure {@link
 * PurchaseSimulationCalculator} — no repository, no tenancy check, and no formula is duplicated
 * here.
 */
@Service
public class SimulatePurchaseUseCase {

  private final GetFinancialSummaryUseCase summaryUseCase;

  public SimulatePurchaseUseCase(GetFinancialSummaryUseCase summaryUseCase) {
    this.summaryUseCase = summaryUseCase;
  }

  public PurchaseSimulationResult handle(
      AuthenticatedUser user, YearMonth month, FinancialScope scope, Money purchaseAmount, int installments) {
    FinancialSummary summary = summaryUseCase.handle(user, month, scope);
    return PurchaseSimulationCalculator.simulate(
        purchaseAmount, installments, summary.budget().value(), summary.total().value(), summary.free().value());
  }
}
