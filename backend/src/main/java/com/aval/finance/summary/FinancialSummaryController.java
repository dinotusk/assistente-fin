package com.aval.finance.summary;

import com.aval.household.FinancialScope;
import com.aval.platform.auth.AuthenticatedUser;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.DateTimeException;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read-only (Fase 21 — no POST/PUT/PATCH/DELETE this round). Controllers never calculate (Fase
 * 22) — every number here comes from {@link GetFinancialSummaryUseCase}.
 */
@RestController
public class FinancialSummaryController {

  private static final DateTimeFormatter MONTH_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM");

  private final GetFinancialSummaryUseCase useCase;

  public FinancialSummaryController(GetFinancialSummaryUseCase useCase) {
    this.useCase = useCase;
  }

  @Operation(
      summary = "Financial summary for one household/profile scope, for one month",
      description =
          "Read-only. `scope=household` sums the whole household; `scope=me` is the household's "
              + "first-position profile; `scope=profile` requires `profileId` (a UUID — never a "
              + "display name) and is authorized against the caller's own resolved household, "
              + "never trusted from the request alone. Money values are JSON strings, not numbers.")
  @GetMapping("/api/v1/financial-summary")
  public FinancialSummaryResponse financialSummary(
      @AuthenticationPrincipal Jwt jwt,
      @Parameter(description = "YYYY-MM", example = "2026-08") @RequestParam String month,
      @Parameter(description = "me | household | profile", example = "household") @RequestParam String scope,
      @Parameter(description = "Required when scope=profile. A financial_profiles.id, never a display name.")
          @RequestParam(required = false)
          @Schema(nullable = true)
          String profileId) {
    AuthenticatedUser user = AuthenticatedUser.fromJwt(jwt);
    YearMonth parsedMonth = parseMonth(month);
    FinancialScope parsedScope = parseScope(scope, profileId);
    FinancialSummary summary = useCase.handle(user, parsedMonth, parsedScope);
    return FinancialSummaryResponse.from(summary);
  }

  private static YearMonth parseMonth(String month) {
    try {
      return YearMonth.parse(month, MONTH_FORMAT);
    } catch (DateTimeException e) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "month deve estar no formato YYYY-MM.");
    }
  }

  private static FinancialScope parseScope(String scope, String profileId) {
    return switch (scope) {
      case "household" -> new FinancialScope.Household();
      case "me" -> new FinancialScope.Me();
      case "profile" -> {
        if (profileId == null || profileId.isBlank()) {
          throw new ApiException(
              ApiErrorType.VALIDATION_ERROR, "profileId é obrigatório quando scope=profile.");
        }
        try {
          yield new FinancialScope.Profile(UUID.fromString(profileId));
        } catch (IllegalArgumentException e) {
          throw new ApiException(ApiErrorType.VALIDATION_ERROR, "profileId deve ser um UUID válido.");
        }
      }
      default -> throw new ApiException(
          ApiErrorType.VALIDATION_ERROR, "scope deve ser um de: me, household, profile.");
    };
  }
}
