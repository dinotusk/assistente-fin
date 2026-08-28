package com.aval.finance.simulations;

import com.aval.finance.Money;
import java.util.List;

public record FutureValueResult(
    Money currentSaved,
    Money monthlyContribution,
    int months,
    Money projectedSaved,
    SimulationStatus status,
    List<SimulationAssumption> assumptions,
    List<SimulationWarning> warnings) {}
