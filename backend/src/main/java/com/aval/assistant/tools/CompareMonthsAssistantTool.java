package com.aval.assistant.tools;

import com.aval.assistant.orchestration.AssistantTool;
import com.aval.assistant.orchestration.JsonSchema;
import com.aval.finance.summary.MonthComparisonResult;
import com.aval.household.FinancialScope;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** {@code compare_months} for the Assistant — thin adapter over {@link CompareMonthsTool}. */
@Component
class CompareMonthsAssistantTool implements AssistantTool {

  private final CompareMonthsTool tool;

  CompareMonthsAssistantTool(CompareMonthsTool tool) {
    this.tool = tool;
  }

  @Override
  public String name() {
    return "compare_months";
  }

  @Override
  public String description() {
    return "Compara dois meses (mesmo escopo): gastos, orcamento, saldo livre, recebido e por categoria, "
        + "com delta absoluto e percentual. O percentual pode vir como NOT_APPLICABLE quando o mes base for "
        + "zero — nesse caso, nunca afirme um percentual, diga que a comparacao nao se aplica.";
  }

  @Override
  public Map<String, Object> inputSchema() {
    return JsonSchema.object(
        Map.of(
            "monthA", JsonSchema.string("Mes base, YYYY-MM"),
            "monthB", JsonSchema.string("Mes de comparacao, YYYY-MM"),
            "scope", JsonSchema.stringEnum("Escopo dos dados", "me", "household", "profile"),
            "profileId", JsonSchema.string("UUID do perfil — obrigatorio quando scope=profile")),
        List.of("monthA", "monthB", "scope"));
  }

  @Override
  public Object execute(ToolExecutionContext context, Map<String, Object> arguments) {
    YearMonth monthA = ToolRequestParsing.parseMonth(AssistantToolArguments.requireString(arguments, "monthA"));
    YearMonth monthB = ToolRequestParsing.parseMonth(AssistantToolArguments.requireString(arguments, "monthB"));
    FinancialScope scope =
        ToolRequestParsing.parseScope(
            AssistantToolArguments.requireString(arguments, "scope"),
            AssistantToolArguments.optionalString(arguments, "profileId"));
    MonthComparisonResult result = tool.execute(context.user(), monthA, monthB, scope);
    return CompareMonthsResponse.from(result);
  }
}
