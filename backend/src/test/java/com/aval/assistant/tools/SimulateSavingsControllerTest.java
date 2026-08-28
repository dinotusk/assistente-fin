package com.aval.assistant.tools;

import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.aval.finance.Money;
import com.aval.finance.simulations.FutureValueResult;
import com.aval.finance.simulations.SavingsSimulationCalculator;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class SimulateSavingsControllerTest {

  @Autowired private MockMvc mockMvc;

  // Not stubbed in these tests — validation happens before the tool would ever be called; the
  // one happy-path test below (fully deterministic, no repository needed since no goalId is
  // used) exercises the tool for real.
  @MockitoBean private SimulateSavingsTool tool;

  @Test
  void withoutTokenIsRejected() throws Exception {
    mockMvc
        .perform(
            post("/api/v1/tools/simulate-savings")
                .contentType("application/json")
                .content("{\"mode\":\"FUTURE_VALUE\",\"month\":\"2026-08\",\"currentSaved\":\"0\",\"monthlyContribution\":\"100\",\"months\":1}"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void invalidModeIsValidationError() throws Exception {
    mockMvc
        .perform(
            post("/api/v1/tools/simulate-savings")
                .contentType("application/json")
                .content("{\"mode\":\"WHATEVER\",\"month\":\"2026-08\",\"monthlyContribution\":\"100\"}")
                .with(jwt()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.type", is("VALIDATION_ERROR")));
  }

  @Test
  void negativeMonthlyContributionIsValidationError() throws Exception {
    mockMvc
        .perform(
            post("/api/v1/tools/simulate-savings")
                .contentType("application/json")
                .content(
                    "{\"mode\":\"TIME_TO_TARGET\",\"month\":\"2026-08\",\"targetAmount\":\"1000\",\"currentSaved\":\"0\",\"monthlyContribution\":\"-10\"}")
                .with(jwt()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.type", is("VALIDATION_ERROR")));
  }

  @Test
  void missingTargetAmountWithoutGoalIdIsValidationError() throws Exception {
    mockMvc
        .perform(
            post("/api/v1/tools/simulate-savings")
                .contentType("application/json")
                .content("{\"mode\":\"TIME_TO_TARGET\",\"month\":\"2026-08\",\"currentSaved\":\"0\",\"monthlyContribution\":\"100\"}")
                .with(jwt()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.type", is("VALIDATION_ERROR")));
  }

  @Test
  void futureValueModeMissingMonthsIsValidationError() throws Exception {
    mockMvc
        .perform(
            post("/api/v1/tools/simulate-savings")
                .contentType("application/json")
                .content("{\"mode\":\"FUTURE_VALUE\",\"month\":\"2026-08\",\"currentSaved\":\"0\",\"monthlyContribution\":\"100\"}")
                .with(jwt()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.type", is("VALIDATION_ERROR")));
  }

  @Test
  void twelveHundredMonthsIsAccepted() throws Exception {
    FutureValueResult result = SavingsSimulationCalculator.futureValue(Money.ZERO, Money.of("1"), 1200);
    when(tool.futureValue(any(), any(), any(), eq(Money.ZERO), eq(Money.of("1")), eq(1200))).thenReturn(result);

    mockMvc
        .perform(
            post("/api/v1/tools/simulate-savings")
                .contentType("application/json")
                .content("{\"mode\":\"FUTURE_VALUE\",\"month\":\"2026-08\",\"currentSaved\":\"0\",\"monthlyContribution\":\"1\",\"months\":1200}")
                .with(jwt()))
        .andExpect(status().isOk());
  }

  @Test
  void twelveHundredOneMonthsIs400() throws Exception {
    mockMvc
        .perform(
            post("/api/v1/tools/simulate-savings")
                .contentType("application/json")
                .content("{\"mode\":\"FUTURE_VALUE\",\"month\":\"2026-08\",\"currentSaved\":\"0\",\"monthlyContribution\":\"1\",\"months\":1201}")
                .with(jwt()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.type", is("VALIDATION_ERROR")));
  }

  @Test
  void extremelyLargeMonthsIs400WithoutHanging() throws Exception {
    mockMvc
        .perform(
            post("/api/v1/tools/simulate-savings")
                .contentType("application/json")
                .content("{\"mode\":\"FUTURE_VALUE\",\"month\":\"2026-08\",\"currentSaved\":\"0\",\"monthlyContribution\":\"1\",\"months\":2000000000}")
                .with(jwt()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.type", is("VALIDATION_ERROR")));
  }

  @Test
  void monetaryValueAboveTheRepresentableLimitIs400() throws Exception {
    mockMvc
        .perform(
            post("/api/v1/tools/simulate-savings")
                .contentType("application/json")
                .content(
                    "{\"mode\":\"TIME_TO_TARGET\",\"month\":\"2026-08\",\"targetAmount\":\"1000000000000.00\",\"currentSaved\":\"0\",\"monthlyContribution\":\"100\"}")
                .with(jwt()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.type", is("VALIDATION_ERROR")));
  }

  @Test
  void exponentNotationAbuseIs400() throws Exception {
    mockMvc
        .perform(
            post("/api/v1/tools/simulate-savings")
                .contentType("application/json")
                .content(
                    "{\"mode\":\"TIME_TO_TARGET\",\"month\":\"2026-08\",\"targetAmount\":\"1000\",\"currentSaved\":\"0\",\"monthlyContribution\":\"1e999999999\"}")
                .with(jwt()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.type", is("VALIDATION_ERROR")));
  }

  @Test
  void validationErrorResponseNeverLeaksStackTraceOrExceptionClassName() throws Exception {
    String body =
        mockMvc
            .perform(
                post("/api/v1/tools/simulate-savings")
                    .contentType("application/json")
                    .content("{\"mode\":\"FUTURE_VALUE\",\"month\":\"2026-08\",\"currentSaved\":\"0\",\"monthlyContribution\":\"1\",\"months\":1201}")
                    .with(jwt()))
            .andReturn()
            .getResponse()
            .getContentAsString();
    org.junit.jupiter.api.Assertions.assertFalse(body.contains("Exception"));
    org.junit.jupiter.api.Assertions.assertFalse(body.contains("\tat "));
    org.junit.jupiter.api.Assertions.assertFalse(body.toLowerCase().contains("select "));
  }
}
