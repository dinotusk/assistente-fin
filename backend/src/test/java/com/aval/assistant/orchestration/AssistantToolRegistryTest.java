package com.aval.assistant.orchestration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AssistantToolRegistryTest {

  private static AssistantTool toolNamed(String name) {
    AssistantTool tool = mock(AssistantTool.class);
    when(tool.name()).thenReturn(name);
    when(tool.description()).thenReturn("desc:" + name);
    when(tool.inputSchema()).thenReturn(Map.of("type", "object"));
    return tool;
  }

  @Test
  void containsExactlyTheFiveCanonicalToolsWhenWiredWithAllFive() {
    AssistantToolRegistry registry =
        new AssistantToolRegistry(
            List.of(
                toolNamed("get_financial_summary"),
                toolNamed("get_expenses"),
                toolNamed("compare_months"),
                toolNamed("get_goals"),
                toolNamed("get_household_profiles")));

    assertThat(registry.definitions())
        .extracting(AssistantToolDefinition::name)
        .containsExactlyInAnyOrder(
            "get_financial_summary", "get_expenses", "compare_months", "get_goals", "get_household_profiles");
  }

  @Test
  void unknownToolNameIsNotFound() {
    AssistantToolRegistry registry = new AssistantToolRegistry(List.of(toolNamed("get_financial_summary")));

    assertThat(registry.find("delete_all_expenses")).isEmpty();
    assertThat(registry.find("get_financial_summary")).isPresent();
  }

  @Test
  void definitionsCarryNameDescriptionAndSchemaForTheLlm() {
    AssistantToolRegistry registry = new AssistantToolRegistry(List.of(toolNamed("get_goals")));

    AssistantToolDefinition definition = registry.definitions().get(0);
    assertThat(definition.name()).isEqualTo("get_goals");
    assertThat(definition.description()).isEqualTo("desc:get_goals");
    assertThat(definition.inputSchema()).containsEntry("type", "object");
  }
}
