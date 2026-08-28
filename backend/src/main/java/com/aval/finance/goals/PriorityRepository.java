package com.aval.finance.goals;

import java.util.List;
import java.util.UUID;

public interface PriorityRepository {

  /** Every priority belonging to a given month — matched by {@code month_id}, same pattern as {@code ExpenseRepository}. */
  List<Priority> findByHouseholdAndMonth(UUID householdId, UUID monthId);
}
