package com.aval.finance.simulations;

import com.aval.finance.Money;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

/**
 * @param monthsRequired empty when the target can never be reached by this plan (zero monthly
 *     contribution and a positive remaining amount) — never a fabricated number; see {@link
 *     SimulationWarning#zeroContribution()}.
 * @param estimatedTargetMonth empty under the same condition as {@link #monthsRequired()}.
 */
public record TimeToTargetResult(
    Money targetAmount,
    Money currentSaved,
    Money monthlyContribution,
    Money remainingAmount,
    Optional<Integer> monthsRequired,
    Optional<YearMonth> estimatedTargetMonth,
    SimulationStatus status,
    List<SimulationAssumption> assumptions,
    List<SimulationWarning> warnings) {}
