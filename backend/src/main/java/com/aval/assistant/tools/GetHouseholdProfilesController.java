package com.aval.assistant.tools;

import com.aval.household.FinancialProfile;
import com.aval.platform.auth.AuthenticatedUser;
import io.swagger.v3.oas.annotations.Operation;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code get_household_profiles} as an HTTP tool endpoint — see {@code GetHouseholdProfilesTool}. */
@RestController
public class GetHouseholdProfilesController {

  private final GetHouseholdProfilesTool tool;

  public GetHouseholdProfilesController(GetHouseholdProfilesTool tool) {
    this.tool = tool;
  }

  @Operation(
      summary = "Financial Tool: get_household_profiles",
      description =
          "Read-only. Returns only the caller's own resolved household's active profiles, "
              + "ordered by sortOrder — never another household's data, never user ids.")
  @GetMapping("/api/v1/tools/household-profiles")
  public HouseholdProfilesResponse householdProfiles(@AuthenticationPrincipal Jwt jwt) {
    AuthenticatedUser user = AuthenticatedUser.fromJwt(jwt);
    List<FinancialProfile> profiles = tool.execute(user);
    return HouseholdProfilesResponse.from(profiles);
  }
}
