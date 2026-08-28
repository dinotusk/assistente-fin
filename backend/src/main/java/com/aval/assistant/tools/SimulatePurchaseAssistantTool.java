package com.aval.assistant.tools;

import com.aval.assistant.orchestration.AssistantTool;
import com.aval.assistant.orchestration.JsonSchema;
import com.aval.finance.Money;
import com.aval.finance.simulations.PurchaseSimulationResult;
import com.aval.household.FinancialScope;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * {@code simulate_purchase} for the Assistant — read-only hypothetical scenario, never writes an
 * expense. See docs/architecture/simulation-engine.md.
 */
@Component
class SimulatePurchaseAssistantTool implements AssistantTool {

  private static final int DEFAULT_INSTALLMENTS = 1;

  private final SimulatePurchaseTool tool;

  SimulatePurchaseAssistantTool(SimulatePurchaseTool tool) {
    this.tool = tool;
  }

  @Override
  public String name() {
    return "simulate_purchase";
  }

  @Override
  public String description() {
    return "Simula hipoteticamente o impacto de uma compra no orcamento de um mes/escopo, sem "
        + "alterar nenhum dado real (nenhuma despesa e criada). Parcelamento e sempre sem juros. "
        + "Use para perguntas como 'posso comprar X?' ou 'e se eu parcelar em N vezes?'. Nunca "
        + "trate o resultado como uma ordem de compra — e apenas uma projecao.";
  }

  @Override
  public Map<String, Object> inputSchema() {
    return JsonSchema.object(
        Map.of(
            "month", JsonSchema.string("Mes no formato YYYY-MM"),
            "scope", JsonSchema.stringEnum("Escopo dos dados", "me", "household", "profile"),
            "profileId", JsonSchema.string("UUID do perfil — obrigatorio quando scope=profile"),
            "purchaseAmount", JsonSchema.string("Valor da compra em reais, como string decimal, ex: \"3500.00\""),
            "installments", JsonSchema.integer("Numero de parcelas, opcional, padrao 1. Sem juros.")),
        List.of("month", "scope", "purchaseAmount"));
  }

  @Override
  public Object execute(ToolExecutionContext context, Map<String, Object> arguments) {
    YearMonth month = ToolRequestParsing.parseMonth(AssistantToolArguments.requireString(arguments, "month"));
    FinancialScope scope =
        ToolRequestParsing.parseScope(
            AssistantToolArguments.requireString(arguments, "scope"),
            AssistantToolArguments.optionalString(arguments, "profileId"));
    Money purchaseAmount = AssistantToolArguments.requireMoney(arguments, "purchaseAmount");
    int installments = AssistantToolArguments.optionalInt(arguments, "installments", DEFAULT_INSTALLMENTS);
    if (!purchaseAmount.isPositive()) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "purchaseAmount deve ser maior que zero.");
    }
    if (installments < 1) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "installments deve ser >= 1.");
    }

    PurchaseSimulationResult result = tool.execute(context.user(), month, scope, purchaseAmount, installments);
    return SimulatePurchaseResponse.from(result);
  }
}
