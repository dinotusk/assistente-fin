package com.aval.finance.simulations;

/**
 * {@code simulate_savings} supports two explicit, non-inferred modes — never guessed from which
 * fields happen to be present, to avoid silently answering a different question than the one
 * asked (see docs/architecture/simulation-engine.md "Savings modes").
 */
public enum SavingsSimulationMode {
  /** "Quando chego em R$X guardando R$Y/mes?" — target-driven, computes months required. */
  TIME_TO_TARGET,
  /** "Se eu guardar R$Y/mes por N meses, quanto terei?" — time-driven, no target involved. */
  FUTURE_VALUE
}
