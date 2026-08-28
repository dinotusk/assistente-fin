package com.aval.assistant.tools;

import com.aval.assistant.orchestration.AssistantTool;
import com.aval.assistant.orchestration.JsonSchema;
import com.aval.finance.goals.GoalView;
import com.aval.household.FinancialScope;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** {@code get_goals} for the Assistant — thin adapter over {@link GetGoalsTool}. */
@Component
class GetGoalsAssistantTool implements AssistantTool {

  private final GetGoalsTool tool;

  GetGoalsAssistantTool(GetGoalsTool tool) {
    this.tool = tool;
  }

  @Override
  public String name() {
    return "get_goals";
  }

  @Override
  public String description() {
    return "Lista as metas/prioridades financeiras (goals) de um mes/escopo, com valor alvo, valor guardado, "
        + "quanto falta e o percentual de progresso ja calculado. Nunca calcule progresso voce mesmo — use o "
        + "valor de 'progress' retornado.";
  }

  @Override
  public Map<String, Object> inputSchema() {
    return JsonSchema.object(
        Map.of(
            "month", JsonSchema.string("Mes no formato YYYY-MM"),
            "scope", JsonSchema.stringEnum("Escopo dos dados", "me", "household", "profile"),
            "profileId", JsonSchema.string("UUID do perfil — obrigatorio quando scope=profile")),
        List.of("month", "scope"));
  }

  @Override
  public Object execute(ToolExecutionContext context, Map<String, Object> arguments) {
    YearMonth month = ToolRequestParsing.parseMonth(AssistantToolArguments.requireString(arguments, "month"));
    FinancialScope scope =
        ToolRequestParsing.parseScope(
            AssistantToolArguments.requireString(arguments, "scope"),
            AssistantToolArguments.optionalString(arguments, "profileId"));
    List<GoalView> goals = tool.execute(context.user(), month, scope);
    return GoalsResponse.from(goals);
  }
}
