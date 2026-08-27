package com.aval.finance.budgets;

import com.aval.finance.Money;
import java.time.YearMonth;
import java.util.UUID;

/** One row of {@code finance_months}. {@code income}/{@code houseContribution} are always present — see {@link com.aval.finance.Money}'s javadoc. */
public record FinancialMonth(
    UUID id, UUID householdId, YearMonth period, String label, Money income, Money houseContribution, boolean planned) {}
