/**
 * Household/tenant boundary — will own the mapping between an authenticated
 * user and the household(s)/profiles they belong to (mirrors the PWA's
 * {@code household_members}/{@code financial_profiles} tables), and the
 * authorization check every future finance endpoint depends on: "does this
 * user actually belong to the household they're asking about."
 *
 * <p>Empty this round — see docs/architecture/ADR-004-tenant-household-authorization.md
 * for the tenancy strategy this boundary will implement, and P2-FINANCIAL-DOMAIN
 * for when it gets a first real implementation.
 */
package com.aval.household;
