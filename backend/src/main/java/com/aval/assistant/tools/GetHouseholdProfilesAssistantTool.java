package com.aval.assistant.tools;

import com.aval.assistant.orchestration.AssistantTool;
import com.aval.assistant.orchestration.JsonSchema;
import com.aval.household.FinancialProfile;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** {@code get_household_profiles} for the Assistant — thin adapter over {@link GetHouseholdProfilesTool}. */
@Component
class GetHouseholdProfilesAssistantTool implements AssistantTool {

  private final GetHouseholdProfilesTool tool;

  GetHouseholdProfilesAssistantTool(GetHouseholdProfilesTool tool) {
    this.tool = tool;
  }

  @Override
  public String name() {
    return "get_household_profiles";
  }

  @Override
  public String description() {
    return "Lista os perfis financeiros (pessoas) da casa do usuario autenticado, com id, nome e posicao. "
        + "Use para descobrir o profileId de uma pessoa antes de chamar outra ferramenta com scope=profile — "
        + "nunca invente ou adivinhe um profileId.";
  }

  @Override
  public Map<String, Object> inputSchema() {
    return JsonSchema.object(Map.of(), List.of());
  }

  @Override
  public Object execute(ToolExecutionContext context, Map<String, Object> arguments) {
    List<FinancialProfile> profiles = tool.execute(context.user());
    return HouseholdProfilesResponse.from(profiles);
  }
}
