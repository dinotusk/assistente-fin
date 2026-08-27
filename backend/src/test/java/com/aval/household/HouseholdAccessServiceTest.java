package com.aval.household;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class HouseholdAccessServiceTest {

  private final HouseholdMembershipRepository memberships = mock(HouseholdMembershipRepository.class);
  private final FinancialProfileRepository profiles = mock(FinancialProfileRepository.class);
  private final HouseholdAccessService service = new HouseholdAccessService(memberships, profiles);

  @Test
  void zeroMembershipsIsResourceNotFound() {
    when(memberships.findHouseholdIdsForUser("user-1")).thenReturn(List.of());

    assertThatThrownBy(() -> service.resolveHouseholdId("user-1"))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.RESOURCE_NOT_FOUND));
  }

  @Test
  void exactlyOneMembershipResolvesToThatHousehold() {
    UUID householdId = UUID.randomUUID();
    when(memberships.findHouseholdIdsForUser("user-1")).thenReturn(List.of(householdId));

    assertThat(service.resolveHouseholdId("user-1")).isEqualTo(householdId);
  }

  @Test
  void moreThanOneMembershipFailsSafelyAsInternalErrorNotSilentlyPickingOne() {
    UUID first = UUID.randomUUID();
    UUID second = UUID.randomUUID();
    when(memberships.findHouseholdIdsForUser("user-1")).thenReturn(List.of(first, second));

    assertThatThrownBy(() -> service.resolveHouseholdId("user-1"))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.INTERNAL_ERROR));
  }

  @Test
  void resolveProfileNotFoundInThisHouseholdIsResourceNotFoundNeverAccessDenied() {
    UUID householdId = UUID.randomUUID();
    UUID profileId = UUID.randomUUID();
    // Simulates a profileId that belongs to a DIFFERENT household — the query itself scopes by
    // householdId, so it never matches, and the caller must never learn the id exists elsewhere.
    when(profiles.findByIdAndHousehold(profileId, householdId)).thenReturn(Optional.empty());

    assertThatThrownBy(() -> service.resolveProfile(householdId, profileId))
        .isInstanceOf(ApiException.class)
        .satisfies(e -> assertThat(((ApiException) e).type()).isEqualTo(ApiErrorType.RESOURCE_NOT_FOUND));
  }

  @Test
  void resolveProfileFoundInThisHouseholdReturnsIt() {
    UUID householdId = UUID.randomUUID();
    FinancialProfile profile = new FinancialProfile(UUID.randomUUID(), householdId, "Ana", ProfileKind.HOUSEHOLD, 0, true);
    when(profiles.findByIdAndHousehold(profile.id(), householdId)).thenReturn(Optional.of(profile));

    assertThat(service.resolveProfile(householdId, profile.id())).isEqualTo(profile);
  }
}
