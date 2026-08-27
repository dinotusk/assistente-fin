package com.aval.platform.web;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public liveness endpoint — deliberately lighter than Actuator's {@code
 * /actuator/health} (no dependency checks, no query, see Fase 32
 * "performance"): a simple 200 proves the process is up and routable, which
 * is what a load balancer/uptime check needs and nothing more.
 */
@RestController
public class HealthController {

  public record HealthResponse(String status) {}

  @Operation(summary = "Liveness check — always public, never queries the database")
  @SecurityRequirements
  @GetMapping("/api/v1/health")
  public HealthResponse health() {
    return new HealthResponse("ok");
  }
}
