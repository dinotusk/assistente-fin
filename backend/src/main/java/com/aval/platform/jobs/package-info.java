/**
 * Boundary for future scheduled jobs and webhook receivers (Open Finance
 * sync, reminder digests, etc.). No {@code @Scheduled} task, no cron, no
 * webhook endpoint exists here yet — Fase 19 explicitly forbids a fake
 * scheduler. Kept as a package so those additions don't require a
 * structural rework later.
 */
package com.aval.platform.jobs;
