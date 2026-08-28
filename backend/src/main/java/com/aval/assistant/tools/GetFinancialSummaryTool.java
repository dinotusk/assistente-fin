package com.aval.assistant.tools;

import com.aval.finance.summary.FinancialSummary;
import com.aval.finance.summary.GetFinancialSummaryUseCase;
import com.aval.household.FinancialScope;
import com.aval.platform.auth.AuthenticatedUser;
import java.time.YearMonth;
import org.springframework.stereotype.Service;

/**
 * {@code get_financial_summary} — the thinnest possible Tool: {@link GetFinancialSummaryUseCase}
 * is P2's own, untouched, already-tested use case; this class exists only so the Tool layer has a
 * uniform entry point per docs/architecture/financial-tools.md, not because there is any new
 * orchestration to add. Deliberately does NOT build a {@link ToolExecutionContext} — {@link
 * GetFinancialSummaryUseCase} already resolves the household itself from {@link
 * AuthenticatedUser}, and re-resolving it here would just be a second, redundant query for no
 * benefit. See financial-tools.md "Tool contract" for why this one Tool is the deliberate
 * exception to the other four's {@link ToolExecutionContext}-first shape.
 */
@Service
public class GetFinancialSummaryTool {

  private final GetFinancialSummaryUseCase useCase;

  public GetFinancialSummaryTool(GetFinancialSummaryUseCase useCase) {
    this.useCase = useCase;
  }

  public FinancialSummary execute(AuthenticatedUser user, YearMonth month, FinancialScope scope) {
    return useCase.handle(user, month, scope);
  }
}
