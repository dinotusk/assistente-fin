package com.aval.household;

/**
 * Mirrors {@code financial_profiles.kind}'s check constraint exactly
 * ({@code 'person' | 'household' | 'managed'}) — a database value, not a
 * decision this domain makes. Deliberately NOT used to distinguish "the
 * spouse" from "a 3rd+ named profile": {@code bootstrap_household}/{@code
 * syncProfiles} (supabaseRepository.ts) both assign {@code 'managed'} to
 * every profile after the first, so kind alone cannot tell a 2nd profile
 * from a 5th. That distinction is {@link FinancialProfile#sortOrder()},
 * matching the PWA's {@code people[index]} positional lookup — see {@link
 * com.aval.finance.summary.FinancialCalculator}.
 */
public enum ProfileKind {
  PERSON,
  HOUSEHOLD,
  MANAGED;

  public static ProfileKind fromDb(String value) {
    return switch (value) {
      case "person" -> PERSON;
      case "household" -> HOUSEHOLD;
      case "managed" -> MANAGED;
      default -> throw new IllegalArgumentException("Unknown financial_profiles.kind: " + value);
    };
  }
}
