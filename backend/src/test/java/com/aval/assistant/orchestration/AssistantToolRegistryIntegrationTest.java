package com.aval.assistant.orchestration;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** Proves the real Spring-wired registry (all beans, not mocks) has exactly the 7 tools P5 expects — no more, no less. */
@SpringBootTest
class AssistantToolRegistryIntegrationTest {

  @Autowired private AssistantToolRegistry registry;

  @Test
  void containsExactlySevenToolsAfterP5() {
    assertThat(registry.definitions())
        .extracting(AssistantToolDefinition::name)
        .containsExactlyInAnyOrder(
            "get_financial_summary",
            "get_expenses",
            "compare_months",
            "get_goals",
            "get_household_profiles",
            "simulate_purchase",
            "simulate_savings");
  }

  @Test
  void unknownToolNameIsStillNotFound() {
    assertThat(registry.find("delete_all_expenses")).isEmpty();
    assertThat(registry.find("simulate_purchase")).isPresent();
    assertThat(registry.find("simulate_savings")).isPresent();
  }
}
