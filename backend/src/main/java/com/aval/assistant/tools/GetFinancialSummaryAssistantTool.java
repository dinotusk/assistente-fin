package com.aval.assistant.tools;

import com.aval.assistant.orchestration.AssistantTool;
import com.aval.assistant.orchestration.JsonSchema;
import com.aval.finance.summary.FinancialSummary;
import com.aval.finance.summary.FinancialSummaryResponse;
import com.aval.household.FinancialScope;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** {@code get_financial_summary} for the Assistant — thin adapter over {@link GetFinancialSummaryTool}, same as the HTTP endpoint. */
@Component
class GetFinancialSummaryAssistantTool implements AssistantTool {

  private final GetFinancialSummaryTool tool;

  GetFinancialSummaryAssistantTool(GetFinancialSummaryTool tool) {
    this.tool = tool;
  }

  @Override
  public String name() {
    return "get_financial_summary";
  }

  @Override
  public String description() {
    return "Retorna o resumo financeiro (orcamento, total gasto, pago, a pagar, recebido, saldo livre, "
        + "categoria principal) de um mes/escopo. Use sempre que precisar de numeros oficiais do usuario "
        + "— nunca calcule esses valores voce mesmo.";
  }

  @Override
  public Map<String, Object> inputSchema() {
    return JsonSchema.object(
        Map.of(
            "month", JsonSchema.string("Mes no formato YYYY-MM, ex: 2026-08"),
            "scope", JsonSchema.stringEnum("Escopo dos dados", "me", "household", "profile"),
            "profileId", JsonSchema.string("UUID do perfil financeiro — obrigatorio quando scope=profile")),
        List.of("month", "scope"));
  }

  @Override
  public Object execute(ToolExecutionContext context, Map<String, Object> arguments) {
    YearMonth month = ToolRequestParsing.parseMonth(AssistantToolArguments.requireString(arguments, "month"));
    FinancialScope scope =
        ToolRequestParsing.parseScope(
            AssistantToolArguments.requireString(arguments, "scope"),
            AssistantToolArguments.optionalString(arguments, "profileId"));
    FinancialSummary summary = tool.execute(context.user(), month, scope);
    return FinancialSummaryResponse.from(summary);
  }
}
