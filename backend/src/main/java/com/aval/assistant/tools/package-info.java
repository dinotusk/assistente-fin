/**
 * Financial Tools (P3-FINANCIAL-TOOLS) — deterministic, LLM-independent, tenancy-checked reads
 * the future Assistant will call: {@code get_financial_summary}, {@code get_expenses}, {@code
 * compare_months}, {@code get_goals}, {@code get_household_profiles}. Each Tool is a thin
 * pass-through onto its own use case in the relevant {@code com.aval.finance.*}/{@code
 * com.aval.household} package — no financial formula is reimplemented here. See {@link
 * com.aval.assistant.tools.ToolExecutionContext} and docs/architecture/financial-tools.md.
 */
package com.aval.assistant.tools;
