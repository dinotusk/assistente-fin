package com.aval.finance.simulations;

/**
 * One explicit, machine-readable assumption a simulation made — every simulation result carries
 * at least {@link #hypotheticalScenario()} and {@link #noInterest()} (purchase) or the savings
 * equivalent, so a consumer (human or LLM) never has to guess what the engine did or didn't
 * model.
 */
public record SimulationAssumption(String code, String description) {

  public static SimulationAssumption hypotheticalScenario() {
    return new SimulationAssumption(
        "HYPOTHETICAL_SCENARIO", "Este e um cenario hipotetico de simulacao; nenhum dado financeiro real foi alterado.");
  }

  public static SimulationAssumption noInterestOnInstallments() {
    return new SimulationAssumption(
        "NO_INTEREST_INSTALLMENTS", "Parcelamento sem juros — nenhuma taxa foi aplicada, pois nenhuma foi informada.");
  }

  public static SimulationAssumption singleMonthImpact() {
    return new SimulationAssumption(
        "SINGLE_MONTH_IMPACT",
        "Apenas a primeira parcela impacta o orcamento do mes simulado; as demais recaem sobre meses futuros e nao foram simuladas.");
  }

  public static SimulationAssumption noInterestOnSavings() {
    return new SimulationAssumption(
        "NO_INTEREST_SAVINGS", "Nenhum rendimento ou juros foi aplicado sobre o valor guardado.");
  }
}
