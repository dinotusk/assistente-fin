package com.aval.finance.simulations;

/** One explicit, machine-readable warning attached to a simulation result — never free text from the LLM. */
public record SimulationWarning(String code, String message) {

  public static SimulationWarning budgetExceeded(String amount) {
    return new SimulationWarning("BUDGET_EXCEEDED", "Esta compra deixaria o saldo do mes negativo em " + amount + ".");
  }

  public static SimulationWarning tightBudget() {
    return new SimulationWarning("TIGHT_BUDGET", "Esta compra deixaria o saldo do mes exatamente em zero, sem folga.");
  }

  public static SimulationWarning zeroContribution() {
    return new SimulationWarning(
        "ZERO_CONTRIBUTION", "Com contribuicao mensal de zero, esta meta nunca sera atingida por este plano.");
  }

  public static SimulationWarning targetBeyondSupportedHorizon() {
    return new SimulationWarning(
        "TARGET_BEYOND_SUPPORTED_HORIZON",
        "Com essa contribuicao mensal, o tempo necessario para atingir a meta ultrapassa o horizonte suportado por esta simulacao ("
            + SimulationLimits.MAX_MONTHS + " meses).");
  }
}
