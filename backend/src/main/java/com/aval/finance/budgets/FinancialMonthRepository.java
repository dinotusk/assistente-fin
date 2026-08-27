package com.aval.finance.budgets;

import java.time.YearMonth;
import java.util.Optional;
import java.util.UUID;

public interface FinancialMonthRepository {

  Optional<FinancialMonth> findByHouseholdAndPeriod(UUID householdId, YearMonth period);
}
