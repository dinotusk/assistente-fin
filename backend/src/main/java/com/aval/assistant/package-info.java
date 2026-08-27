/**
 * Aval Orchestrator boundary (roadmap Fase 4-6): question → turn controller
 * → resolve identity/scope/period → select tools → execute → validate →
 * LLM interprets → response. The LLM never does financial arithmetic here —
 * this domain's tools compute, the model only explains.
 *
 * <p>No LLM SDK, no prompt, no fake tool exists yet — explicitly out of
 * scope for P1. See {@link com.aval.assistant.tools}, {@link
 * com.aval.assistant.orchestration}, {@link com.aval.assistant.turns},
 * {@link com.aval.assistant.richblocks} for the planned sub-boundaries.
 */
package com.aval.assistant;
