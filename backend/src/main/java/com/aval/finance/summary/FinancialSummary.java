package com.aval.finance.summary;

import com.aval.household.FinancialScope;
import java.time.YearMonth;
import java.util.Optional;

/**
 * Reproduces calc.ts's {@code Metrics} shape for exactly the fields Fase 9/23 of
 * P2-FINANCIAL-DOMAIN asked for: {@code total, received, pending, paid, free, budget,
 * topCategory}. {@code saving}, {@code paidRate}, and {@code daysLeft} are deliberately not
 * carried here — see docs/architecture/financial-domain.md "Month headline decision": they are
 * UI-headline-adjacent derivations, not requested by this endpoint's contract, and porting them
 * unused would be exactly the premature scope this task's rules warn against.
 */
public record FinancialSummary(
    FinancialScope scope,
    YearMonth month,
    ProvenancedMoney budget,
    ProvenancedMoney total,
    ProvenancedMoney paid,
    ProvenancedMoney pending,
    ProvenancedMoney received,
    ProvenancedMoney free,
    Optional<CategoryTotal> topCategory) {}
