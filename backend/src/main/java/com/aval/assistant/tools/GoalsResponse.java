package com.aval.assistant.tools;

import com.aval.finance.goals.GoalView;
import com.aval.finance.goals.Priority;
import com.aval.finance.goals.PriorityStatus;
import java.util.List;

/** The wire shape for {@code GET /api/v1/tools/goals}. */
public record GoalsResponse(List<GoalItem> items) {

  public record GoalItem(
      String id,
      String profileId,
      String description,
      MoneyValue targetAmount,
      MoneyValue savedAmount,
      MoneyValue remaining,
      PercentResponse progress,
      int rank,
      String status) {}

  public record MoneyValue(String value, String provenance) {}

  public static GoalsResponse from(List<GoalView> goals) {
    return new GoalsResponse(goals.stream().map(GoalsResponse::itemOf).toList());
  }

  private static GoalItem itemOf(GoalView goal) {
    Priority p = goal.priority();
    return new GoalItem(
        p.id().toString(),
        p.profileId().toString(),
        p.description(),
        // target_amount/saved_amount are stored columns, read as-is — RECORDED, never derived.
        new MoneyValue(p.targetAmount().value().toPlainString(), "RECORDED"),
        new MoneyValue(p.savedAmount().value().toPlainString(), "RECORDED"),
        // remaining/progress are always derived by PriorityCalculator — CALCULATED.
        new MoneyValue(goal.remaining().value().toPlainString(), "CALCULATED"),
        PercentResponse.from(goal.progress()),
        p.rank(),
        statusOf(p.status()));
  }

  private static String statusOf(PriorityStatus status) {
    return switch (status) {
      case PENDING -> "PENDING";
      case PAID -> "PAID";
      case DEFERRED -> "DEFERRED";
    };
  }
}
