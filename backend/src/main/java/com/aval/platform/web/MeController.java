package com.aval.platform.web;

import com.aval.platform.auth.AuthenticatedUser;
import io.swagger.v3.oas.annotations.Operation;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Protected diagnostic endpoint proving JWT validation end to end: no
 * token/invalid token never reaches this method body (Spring Security
 * rejects it first, see SecurityConfig) — this method only ever runs with
 * an already-validated {@link Jwt}. Returns the caller's own identity only,
 * derived from the token, never anything client-supplied.
 */
@RestController
public class MeController {

  public record MeResponse(boolean authenticated, String userId, String email) {}

  @Operation(summary = "Returns the caller's own identity, derived from the validated JWT")
  @GetMapping("/api/v1/me")
  public MeResponse me(@AuthenticationPrincipal Jwt jwt) {
    AuthenticatedUser user = AuthenticatedUser.fromJwt(jwt);
    return new MeResponse(true, user.id(), user.email());
  }
}
