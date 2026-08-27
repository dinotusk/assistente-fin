package com.aval.household;

import java.util.UUID;

/**
 * A named budget/expense owner within a household (mirrors {@code
 * financial_profiles}). Not tied to a Supabase auth user — a household's
 * members (distinct authenticated logins) share the same set of profiles,
 * and any member may view any profile's scope. See {@code
 * FinancialScope}'s javadoc for why this decoupling matters for {@code
 * scope=me}.
 */
public record FinancialProfile(
    UUID id, UUID householdId, String name, ProfileKind kind, int sortOrder, boolean active) {}
