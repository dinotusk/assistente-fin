package com.aval.household;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FinancialProfileRepository {

  /** Active profiles for a household, ordered by {@code sort_order} — the same order the PWA's {@code people[]} array uses. */
  List<FinancialProfile> findActiveByHousehold(UUID householdId);

  /**
   * A single profile, scoped to {@code householdId} in the query itself
   * (not just checked after the fact) — a profile id from another
   * household simply does not match, so this never leaks whether that id
   * exists elsewhere.
   */
  Optional<FinancialProfile> findByIdAndHousehold(UUID profileId, UUID householdId);
}
