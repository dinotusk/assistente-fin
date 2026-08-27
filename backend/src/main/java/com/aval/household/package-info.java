/**
 * Household/tenant boundary — owns the mapping between an authenticated user and the
 * household/profiles they belong to (mirrors {@code household_members}/{@code
 * financial_profiles}), and {@link com.aval.household.HouseholdAccessService}, the authorization
 * check every finance query depends on: "does this user actually belong to the household they're
 * asking about" — see docs/architecture/ADR-004-tenant-household-authorization.md and its
 * P2-FINANCIAL-DOMAIN addendum for why this is explicit parameterized SQL against {@code
 * household_members}, not a call to the {@code is_household_member()}/{@code
 * is_household_admin()} functions (those rely on {@code auth.uid()}, which a direct JDBC
 * connection never has).
 */
package com.aval.household;
