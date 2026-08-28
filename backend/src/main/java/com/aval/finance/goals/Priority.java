package com.aval.finance.goals;

import com.aval.finance.Money;
import java.util.UUID;

/**
 * One row of {@code priorities} — the database/domain-faithful name (matches the table and the
 * frontend's own {@code Priority} type in {@code types.ts}). "Goal" is the external, tool-facing
 * name P3 exposes this as ({@code get_goals}); internally it maps 1:1 onto this existing concept
 * — no new domain model was invented for P3. See docs/architecture/financial-tools.md.
 */
public record Priority(
    UUID id,
    UUID householdId,
    UUID monthId,
    UUID profileId,
    String description,
    Money targetAmount,
    Money savedAmount,
    int rank,
    PriorityStatus status) {}
