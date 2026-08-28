package com.aval.assistant.orchestration;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Minimal JSON Schema object builder for {@link AssistantTool#inputSchema()} declarations — just
 * enough (`object`/`string`/enum/`required`) for the five Financial Tools' flat parameter shapes.
 * Not a general-purpose schema library; grows only if a future tool's shape genuinely needs more.
 */
public final class JsonSchema {

  private JsonSchema() {}

  public static Map<String, Object> object(Map<String, Object> properties, List<String> required) {
    Map<String, Object> schema = new LinkedHashMap<>();
    schema.put("type", "object");
    schema.put("properties", properties);
    schema.put("required", required);
    return schema;
  }

  public static Map<String, Object> string(String description) {
    return Map.of("type", "string", "description", description);
  }

  public static Map<String, Object> stringEnum(String description, String... values) {
    Map<String, Object> schema = new LinkedHashMap<>();
    schema.put("type", "string");
    schema.put("description", description);
    schema.put("enum", List.of(values));
    return schema;
  }

  public static Map<String, Object> integer(String description) {
    return Map.of("type", "integer", "description", description);
  }
}
