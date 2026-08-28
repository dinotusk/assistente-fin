package com.aval.assistant.orchestration;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * The closed set of tools the Assistant may call — Spring wires in every {@link AssistantTool}
 * bean, but only five exist in this codebase (see {@code com.aval.assistant.tools}'s five
 * adapter classes), so this registry can never grow beyond them without a reviewed code change.
 * The model can never invoke an arbitrary bean/method: every call the orchestrator executes goes
 * through {@link #find(String)} first, and an unrecognized name simply isn't found — see
 * {@code AssistantOrchestrator} for what happens next (a controlled error result, not an
 * exception, not a crash).
 */
@Component
public class AssistantToolRegistry {

  private final Map<String, AssistantTool> toolsByName;

  public AssistantToolRegistry(List<AssistantTool> tools) {
    Map<String, AssistantTool> byName = new LinkedHashMap<>();
    for (AssistantTool tool : tools) {
      byName.put(tool.name(), tool);
    }
    this.toolsByName = Map.copyOf(byName);
  }

  public Optional<AssistantTool> find(String name) {
    return Optional.ofNullable(toolsByName.get(name));
  }

  public List<AssistantToolDefinition> definitions() {
    return toolsByName.values().stream().map(AssistantToolDefinition::from).toList();
  }
}
