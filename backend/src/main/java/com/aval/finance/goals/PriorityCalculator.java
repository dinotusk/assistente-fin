package com.aval.finance.goals;

import com.aval.finance.Money;
import com.aval.finance.Percent;

/**
 * Pure port of {@code ai.ts}'s GOALS-context progress math (the only place the frontend already
 * computes a priority's progress) — no Spring, no I/O, mirrors {@link
 * com.aval.finance.summary.FinancialCalculator}'s shape. {@code faltante = Math.max(0, valorAlvo -
 * item.saved)} and {@code progresso = valorAlvo > 0 ? Math.min(1, item.saved / valorAlvo) : 0} are
 * the exact rules ported here; see docs/architecture/financial-tools.md "Goals" for the parity
 * note.
 */
public final class PriorityCalculator {

  private PriorityCalculator() {}

  public static GoalView toView(Priority priority) {
    Money remaining = Money.max(Money.ZERO, priority.targetAmount().subtract(priority.savedAmount()));
    Percent progress = Percent.ofProgressRatio(priority.savedAmount().value(), priority.targetAmount().value());
    return new GoalView(priority, remaining, progress);
  }
}
