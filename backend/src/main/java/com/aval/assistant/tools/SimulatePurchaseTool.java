package com.aval.assistant.tools;

import com.aval.finance.Money;
import com.aval.finance.simulations.PurchaseSimulationResult;
import com.aval.finance.simulations.SimulatePurchaseUseCase;
import com.aval.household.FinancialScope;
import com.aval.platform.auth.AuthenticatedUser;
import java.time.YearMonth;
import org.springframework.stereotype.Service;

/**
 * {@code simulate_purchase} — thin adapter over {@link SimulatePurchaseUseCase}. Deliberately
 * does NOT build a {@link ToolExecutionContext} — {@code SimulatePurchaseUseCase} delegates
 * straight to {@code GetFinancialSummaryUseCase}, which already resolves the household itself
 * from {@link AuthenticatedUser}; the exact same asymmetry {@link GetFinancialSummaryTool}
 * already documents.
 */
@Service
public class SimulatePurchaseTool {

  private final SimulatePurchaseUseCase useCase;

  public SimulatePurchaseTool(SimulatePurchaseUseCase useCase) {
    this.useCase = useCase;
  }

  public PurchaseSimulationResult execute(
      AuthenticatedUser user, YearMonth month, FinancialScope scope, Money purchaseAmount, int installments) {
    return useCase.handle(user, month, scope, purchaseAmount, installments);
  }
}
