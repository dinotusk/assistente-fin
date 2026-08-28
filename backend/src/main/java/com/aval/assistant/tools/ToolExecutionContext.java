package com.aval.assistant.tools;

import com.aval.household.HouseholdAccessService;
import com.aval.platform.auth.AuthenticatedUser;
import java.util.UUID;

/**
 * The one thing every Financial Tool executes against: the caller's own validated identity and
 * their server-resolved household — never anything a client sends. Created exclusively on the
 * server, exactly once per request, via {@link #resolve}; no constructor here accepts a raw
 * household id, so a Tool cannot accidentally be handed a client-supplied one.
 *
 * <p>This is the P3 embodiment of the ADR-004 addendum's rule for every new query this phase
 * adds: {@code householdId} is never trusted from a request parameter, only ever re-derived from
 * {@link AuthenticatedUser#id()} through {@link HouseholdAccessService#resolveHouseholdId}.
 */
public record ToolExecutionContext(AuthenticatedUser user, UUID householdId) {

  public static ToolExecutionContext resolve(AuthenticatedUser user, HouseholdAccessService householdAccess) {
    return new ToolExecutionContext(user, householdAccess.resolveHouseholdId(user.id()));
  }
}
