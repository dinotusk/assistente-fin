package com.aval.finance.simulations;

/**
 * A closed, auditable classification for a simulation's outcome — never a free-text verdict from
 * the LLM, never a magic "financial score". See docs/architecture/simulation-engine.md
 * "Feasibility rule" for exactly which objective fact each value corresponds to, per simulation.
 */
public enum SimulationStatus {
  FEASIBLE,
  WARNING,
  NOT_FEASIBLE,
  INSUFFICIENT_DATA
}
