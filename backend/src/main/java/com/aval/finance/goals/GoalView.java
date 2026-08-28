package com.aval.finance.goals;

import com.aval.finance.Money;
import com.aval.finance.Percent;

/**
 * A {@link Priority} with its derived (never stored) numbers attached — {@link #remaining} and
 * {@link #progress} are always {@code CALCULATED}, computed by {@link PriorityCalculator}, never
 * here or in {@code GetGoalsUseCase} (same "use case doesn't calculate" rule as
 * {@code GetFinancialSummaryUseCase}).
 */
public record GoalView(Priority priority, Money remaining, Percent progress) {}
