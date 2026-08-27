package com.aval.household;

import java.util.List;
import java.util.UUID;

/**
 * Reads {@code household_members} directly — see the ADR-004 addendum for
 * why this queries the table explicitly instead of calling {@code
 * is_household_member()}/{@code is_household_admin()} (both {@code
 * security definer} functions that read {@code auth.uid()}, which a direct
 * JDBC connection never has set).
 */
public interface HouseholdMembershipRepository {

  /**
   * Every household id this user belongs to. The caller (see {@link
   * HouseholdAccessService}) is responsible for treating anything other
   * than exactly one result as the specific condition it is — this method
   * itself must never silently narrow the result (no {@code LIMIT 1}).
   */
  List<UUID> findHouseholdIdsForUser(String userId);
}
