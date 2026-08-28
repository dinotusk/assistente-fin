package com.aval.assistant.tools;

import com.aval.household.FinancialProfile;
import com.aval.household.HouseholdAccessService;
import com.aval.platform.auth.AuthenticatedUser;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * {@code get_household_profiles} — deliberately has no dedicated use case class.
 * {@link HouseholdAccessService#activeProfiles} already IS the application-layer read this tool
 * needs (tenancy-resolved, sortOrder-ordered, no calculation involved); wrapping a single
 * pass-through method call in its own {@code UseCase} class would be exactly the premature
 * ceremony docs/architecture/financial-tools.md's "Tool contract" section argues against. See
 * that document for the full comparison against the other four tools' shape.
 */
@Service
public class GetHouseholdProfilesTool {

  private final HouseholdAccessService householdAccess;

  public GetHouseholdProfilesTool(HouseholdAccessService householdAccess) {
    this.householdAccess = householdAccess;
  }

  public List<FinancialProfile> execute(AuthenticatedUser user) {
    ToolExecutionContext context = ToolExecutionContext.resolve(user, householdAccess);
    return householdAccess.activeProfiles(context.householdId());
  }
}
