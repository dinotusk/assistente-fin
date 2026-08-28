package com.aval.assistant.tools;

import com.aval.household.FinancialProfile;
import com.aval.household.ProfileKind;
import java.util.List;

/**
 * The wire shape for {@code GET /api/v1/tools/household-profiles}. Carries only what a caller
 * needs to resolve {@code ME}/{@code PROFILE} scopes for the other tools — no user ids, no
 * authentication details, nothing from another household (the query itself is
 * household-scoped — see {@code HouseholdAccessService#activeProfiles}).
 */
public record HouseholdProfilesResponse(List<ProfileItem> profiles) {

  public record ProfileItem(String id, String name, String kind, int sortOrder) {}

  public static HouseholdProfilesResponse from(List<FinancialProfile> profiles) {
    return new HouseholdProfilesResponse(profiles.stream().map(HouseholdProfilesResponse::itemOf).toList());
  }

  private static ProfileItem itemOf(FinancialProfile profile) {
    return new ProfileItem(profile.id().toString(), profile.name(), kindOf(profile.kind()), profile.sortOrder());
  }

  private static String kindOf(ProfileKind kind) {
    return switch (kind) {
      case PERSON -> "PERSON";
      case HOUSEHOLD -> "HOUSEHOLD";
      case MANAGED -> "MANAGED";
    };
  }
}
