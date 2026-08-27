/**
 * Open Finance boundary (roadmap Fase 9). Pluggy is the likely first
 * provider, but this domain must never couple directly to it — see {@link
 * com.aval.openfinance.provider} for the adapter interface that keeps the
 * provider swappable. Pipeline: provider → ingestion → normalization →
 * classification/reconciliation → Aval's own financial model.
 *
 * <p>A bank transfer is never automatically an expense — the domain must be
 * able to represent transferência própria, repasse entre casal, reembolso,
 * investimento, pagamento, gasto, and desconhecido, each with a confidence
 * level; insufficient evidence must surface as "não consigo determinar",
 * never a guessed classification.
 *
 * <p>No provider client, no API key, no webhook, no sandbox call exists yet
 * — explicitly out of scope for P1. Empty this round.
 */
package com.aval.openfinance;
