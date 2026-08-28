package com.aval.assistant.tools;

import com.aval.assistant.orchestration.AssistantTool;
import com.aval.assistant.orchestration.JsonSchema;
import com.aval.finance.Money;
import com.aval.finance.simulations.FutureValueResult;
import com.aval.finance.simulations.SimulationLimits;
import com.aval.finance.simulations.TimeToTargetResult;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * {@code simulate_savings} for the Assistant — two explicit modes (see {@code
 * SavingsSimulationMode}), never inferred. Read-only, no interest/yield modeled.
 */
@Component
class SimulateSavingsAssistantTool implements AssistantTool {

  private final SimulateSavingsTool tool;

  SimulateSavingsAssistantTool(SimulateSavingsTool tool) {
    this.tool = tool;
  }

  @Override
  public String name() {
    return "simulate_savings";
  }

  @Override
  public String description() {
    return "Simula hipoteticamente uma meta de poupanca, sem alterar nenhum dado real. Modo "
        + "TIME_TO_TARGET responde 'quando chego em R$X guardando R$Y/mes?'; modo FUTURE_VALUE "
        + "responde 'se eu guardar R$Y/mes por N meses, quanto terei?'. Nunca modela rendimento "
        + "ou juros sobre o valor guardado. Se goalId nao for informado, targetAmount e "
        + "currentSaved (ou so currentSaved, no modo FUTURE_VALUE) devem ser informados "
        + "explicitamente — nunca adivinhe esses valores.";
  }

  @Override
  public Map<String, Object> inputSchema() {
    return JsonSchema.object(
        Map.of(
            "mode", JsonSchema.stringEnum("Modo da simulacao", "TIME_TO_TARGET", "FUTURE_VALUE"),
            "month", JsonSchema.string("Mes-base no formato YYYY-MM"),
            "goalId", JsonSchema.string("UUID de uma meta existente, opcional — obtenha via get_goals, nunca invente"),
            "targetAmount", JsonSchema.string("Valor alvo em reais (string decimal) — obrigatorio no modo TIME_TO_TARGET quando goalId ausente"),
            "currentSaved", JsonSchema.string("Valor ja guardado em reais (string decimal) — obrigatorio quando goalId ausente"),
            "monthlyContribution", JsonSchema.string("Contribuicao mensal em reais (string decimal), nunca negativa"),
            "months", JsonSchema.integer("Numero de meses a projetar, entre 0 e 1200 — obrigatorio no modo FUTURE_VALUE")),
        List.of("mode", "month", "monthlyContribution"));
  }

  @Override
  public Object execute(ToolExecutionContext context, Map<String, Object> arguments) {
    String mode = AssistantToolArguments.requireString(arguments, "mode");
    YearMonth month = ToolRequestParsing.parseMonth(AssistantToolArguments.requireString(arguments, "month"));
    Optional<UUID> goalId = AssistantToolArguments.optionalUuid(arguments, "goalId");
    Money monthlyContribution = AssistantToolArguments.requireMoney(arguments, "monthlyContribution");
    if (monthlyContribution.isNegative()) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "monthlyContribution nao pode ser negativo.");
    }

    return switch (mode) {
      case "TIME_TO_TARGET" -> {
        Money targetAmount = requireExplicitOrGoal(arguments, "targetAmount", goalId);
        Money currentSaved = requireExplicitOrGoal(arguments, "currentSaved", goalId);
        if (targetAmount.isNegative()) throw new ApiException(ApiErrorType.VALIDATION_ERROR, "targetAmount nao pode ser negativo.");
        if (currentSaved.isNegative()) throw new ApiException(ApiErrorType.VALIDATION_ERROR, "currentSaved nao pode ser negativo.");
        TimeToTargetResult result = tool.timeToTarget(context.user(), month, goalId, targetAmount, currentSaved, monthlyContribution);
        yield SimulateSavingsResponse.fromTimeToTarget(result);
      }
      case "FUTURE_VALUE" -> {
        Money currentSaved = requireExplicitOrGoal(arguments, "currentSaved", goalId);
        if (currentSaved.isNegative()) throw new ApiException(ApiErrorType.VALIDATION_ERROR, "currentSaved nao pode ser negativo.");
        int months = AssistantToolArguments.optionalInt(arguments, "months", -1);
        if (!SimulationLimits.isWithinMonthsBounds(months)) {
          throw new ApiException(
              ApiErrorType.VALIDATION_ERROR,
              "months e obrigatorio, entre " + SimulationLimits.MIN_MONTHS + " e " + SimulationLimits.MAX_MONTHS + ".");
        }
        FutureValueResult result = tool.futureValue(context.user(), month, goalId, currentSaved, monthlyContribution, months);
        yield SimulateSavingsResponse.fromFutureValue(result);
      }
      default -> throw new ApiException(ApiErrorType.VALIDATION_ERROR, "mode deve ser um de: TIME_TO_TARGET, FUTURE_VALUE.");
    };
  }

  /**
   * When {@code goalId} is present, the real value is sourced from the goal itself ({@code
   * SimulateSavingsUseCase} resolves it) — this method only needs to satisfy the tool's own
   * required-{@code Money}-parameter shape, so any placeholder is safe here (it is never read).
   * When {@code goalId} is absent, the explicit argument is genuinely required.
   */
  private Money requireExplicitOrGoal(Map<String, Object> arguments, String key, Optional<UUID> goalId) {
    if (goalId.isPresent()) {
      return AssistantToolArguments.optionalMoney(arguments, key).orElse(Money.ZERO);
    }
    return AssistantToolArguments.requireMoney(arguments, key);
  }
}
