package com.aval.household;

import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * The one place every finance query's tenancy check goes through — see the
 * ADR-004 addendum. Resolves the authenticated caller's household strictly
 * from their own JWT-derived user id (never a client-supplied value), and
 * treats "how many households does this user belong to" as an explicit
 * three-way condition instead of an {@code ORDER BY ... LIMIT 1} that would
 * silently paper over the case that should not happen.
 */
@Service
public class HouseholdAccessService {

  private static final Logger log = LoggerFactory.getLogger(HouseholdAccessService.class);

  private final HouseholdMembershipRepository memberships;
  private final FinancialProfileRepository profiles;

  public HouseholdAccessService(
      HouseholdMembershipRepository memberships, FinancialProfileRepository profiles) {
    this.memberships = memberships;
    this.profiles = profiles;
  }

  /**
   * @throws ApiException RESOURCE_NOT_FOUND if the user belongs to no household (0 memberships);
   *     INTERNAL_ERROR if the user belongs to more than one — the product invariant
   *     ("exactly one household per user", enforced by {@code redeem_household_invite})
   *     is violated, which should not be possible; failing loudly here is deliberate,
   *     not a UX nicety.
   */
  public UUID resolveHouseholdId(String userId) {
    List<UUID> householdIds = memberships.findHouseholdIdsForUser(userId);
    if (householdIds.isEmpty()) {
      throw new ApiException(
          ApiErrorType.RESOURCE_NOT_FOUND, "Nenhuma casa financeira encontrada para este usuario.");
    }
    if (householdIds.size() > 1) {
      log.error(
          "Inconsistent household membership: user {} belongs to {} households ({}), expected exactly 1",
          userId,
          householdIds.size(),
          householdIds);
      throw new ApiException(
          ApiErrorType.INTERNAL_ERROR, "Ocorreu um erro interno. Tente novamente.");
    }
    return householdIds.get(0);
  }

  /**
   * Resolves a {@link FinancialScope} to the concrete profile(s) it grants access to within
   * {@code householdId}. A {@link FinancialScope.Profile} whose id doesn't belong to this
   * household is RESOURCE_NOT_FOUND, not ACCESS_DENIED — the caller must never learn whether
   * that id exists in a household they don't belong to.
   */
  public FinancialProfile resolveProfile(UUID householdId, UUID profileId) {
    return profiles
        .findByIdAndHousehold(profileId, householdId)
        .orElseThrow(
            () ->
                new ApiException(ApiErrorType.RESOURCE_NOT_FOUND, "Perfil financeiro não encontrado."));
  }

  public List<FinancialProfile> activeProfiles(UUID householdId) {
    return profiles.findActiveByHousehold(householdId);
  }
}
