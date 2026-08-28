package com.aval.finance.summary;

import com.aval.finance.Money;
import com.aval.finance.Percent;

/**
 * One category's month-over-month delta. {@code totalA}/{@code totalB} default to {@link
 * Money#ZERO} for a category absent from that month's {@link CategoryTotal} list — {@code
 * categoryTotals} already drops categories totalling exactly zero (the {@code > 0} filter,
 * parity with calc.ts), so "absent" there already means "zero", not "unknown"; this is not a new
 * NO_DATA case, just the pre-existing categoryTotals semantics carried through.
 */
public record CategoryComparison(String category, Money totalA, Money totalB, Money delta, Percent deltaPercent) {}
