package com.aval.finance.summary;

import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.aval.finance.Money;
import com.aval.household.FinancialScope;
import java.time.YearMonth;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/** Security/contract tests for GET /api/v1/financial-summary — Fase 31/34. Calculation itself is FinancialCalculatorTest's job. */
@SpringBootTest
@AutoConfigureMockMvc
class FinancialSummaryControllerTest {

  @Autowired private MockMvc mockMvc;

  @MockitoBean private GetFinancialSummaryUseCase useCase;

  private static FinancialSummary fixtureSummary(FinancialScope scope) {
    return new FinancialSummary(
        scope,
        YearMonth.of(2026, 8),
        ProvenancedMoney.calculated(Money.of("5500")),
        ProvenancedMoney.calculated(Money.of("1600")),
        ProvenancedMoney.calculated(Money.of("900")),
        ProvenancedMoney.calculated(Money.of("700")),
        ProvenancedMoney.calculated(Money.ZERO),
        ProvenancedMoney.calculated(Money.of("3900")),
        Optional.of(new CategoryTotal("Casa", Money.of("700"))));
  }

  @Test
  void withoutTokenIsRejected() throws Exception {
    mockMvc
        .perform(get("/api/v1/financial-summary").param("month", "2026-08").param("scope", "household"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.type", is("AUTHENTICATION_REQUIRED")));
  }

  @Test
  void validHouseholdScopeReturnsMappedSummary() throws Exception {
    when(useCase.handle(any(), eq(YearMonth.of(2026, 8)), eq(new FinancialScope.Household())))
        .thenReturn(fixtureSummary(new FinancialScope.Household()));

    mockMvc
        .perform(
            get("/api/v1/financial-summary")
                .param("month", "2026-08")
                .param("scope", "household")
                .with(jwt()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.month", is("2026-08")))
        .andExpect(jsonPath("$.scope.type", is("HOUSEHOLD")))
        .andExpect(jsonPath("$.budget.value", is("5500.00")))
        .andExpect(jsonPath("$.budget.provenance", is("CALCULATED")))
        .andExpect(jsonPath("$.expenses.value", is("1600.00")))
        .andExpect(jsonPath("$.paid.value", is("900.00")))
        .andExpect(jsonPath("$.pending.value", is("700.00")))
        .andExpect(jsonPath("$.received.value", is("0.00")))
        .andExpect(jsonPath("$.free.value", is("3900.00")))
        .andExpect(jsonPath("$.topCategory.category", is("Casa")))
        .andExpect(jsonPath("$.topCategory.value", is("700.00")))
        .andExpect(header().exists("X-Request-ID"));
  }

  @Test
  void invalidMonthFormatIsValidationError() throws Exception {
    mockMvc
        .perform(get("/api/v1/financial-summary").param("month", "08/2026").param("scope", "household").with(jwt()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.type", is("VALIDATION_ERROR")));
  }

  @Test
  void invalidScopeIsValidationError() throws Exception {
    mockMvc
        .perform(get("/api/v1/financial-summary").param("month", "2026-08").param("scope", "everyone").with(jwt()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.type", is("VALIDATION_ERROR")));
  }

  @Test
  void profileScopeWithoutProfileIdIsValidationError() throws Exception {
    mockMvc
        .perform(get("/api/v1/financial-summary").param("month", "2026-08").param("scope", "profile").with(jwt()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.type", is("VALIDATION_ERROR")));
  }

  @Test
  void profileScopeWithNonUuidProfileIdIsValidationError() throws Exception {
    mockMvc
        .perform(
            get("/api/v1/financial-summary")
                .param("month", "2026-08")
                .param("scope", "profile")
                .param("profileId", "Rafael")
                .with(jwt()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.type", is("VALIDATION_ERROR")));
  }

  @Test
  void profileScopeWithValidUuidReachesTheUseCase() throws Exception {
    UUID profileId = UUID.randomUUID();
    when(useCase.handle(any(), eq(YearMonth.of(2026, 8)), eq(new FinancialScope.Profile(profileId))))
        .thenReturn(fixtureSummary(new FinancialScope.Profile(profileId)));

    mockMvc
        .perform(
            get("/api/v1/financial-summary")
                .param("month", "2026-08")
                .param("scope", "profile")
                .param("profileId", profileId.toString())
                .with(jwt()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.scope.type", is("PROFILE")))
        .andExpect(jsonPath("$.scope.profileId", is(profileId.toString())));
  }

  @Test
  void errorResponseNeverLeaksStackTraceOrExceptionClassName() throws Exception {
    String body =
        mockMvc
            .perform(get("/api/v1/financial-summary").param("month", "bad").param("scope", "household").with(jwt()))
            .andReturn()
            .getResponse()
            .getContentAsString();
    org.junit.jupiter.api.Assertions.assertFalse(body.contains("Exception"));
    org.junit.jupiter.api.Assertions.assertFalse(body.contains("\tat "));
  }
}
