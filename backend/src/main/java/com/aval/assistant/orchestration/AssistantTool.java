package com.aval.assistant.orchestration;

import com.aval.assistant.tools.ToolExecutionContext;
import java.util.Map;

/**
 * One Financial Tool as the Assistant is allowed to call it. Every implementation is a thin
 * adapter over its corresponding P3 Financial Tool (see {@code com.aval.assistant.tools}) —
 * {@link #execute} parses the model's raw, untrusted {@code arguments} into the same typed
 * inputs the HTTP `/api/v1/tools/*` endpoints already validate (reusing the exact same parsing),
 * then delegates. No implementation of this interface ever computes a financial number itself.
 *
 * <p>{@link #execute} receives {@link ToolExecutionContext}, never a raw household id or the
 * model's own notion of "which household" — the context is built once per assistant request by
 * {@code AssistantOrchestrator}, exactly like every other tenancy-checked entry point in this
 * codebase (ADR-004 addendum).
 */
public interface AssistantTool {

  /** Stable, LLM-facing name — e.g. {@code get_financial_summary}. Never renamed once shipped: it becomes part of the model's learned behavior. */
  String name();

  /** What the model sees to decide whether/how to call this tool. Written for the model, not for a human developer. */
  String description();

  /** A JSON Schema object (see {@link JsonSchema}) describing the arguments this tool accepts. */
  Map<String, Object> inputSchema();

  /**
   * @param arguments the model's raw, unvalidated function-call arguments.
   * @return a JSON-serializable result (typically the same *Response record the matching HTTP
   *     tool endpoint returns).
   * @throws com.aval.platform.errors.ApiException on invalid arguments or a tenancy/not-found
   *     failure — the orchestrator turns this into a tool-result error message the model can
   *     react to, never a raw exception reaching the client.
   */
  Object execute(ToolExecutionContext context, Map<String, Object> arguments);
}
