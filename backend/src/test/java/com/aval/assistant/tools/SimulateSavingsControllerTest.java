package com.aval.assistant.tools;

import static org.hamcrest.Matchers.is;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
}
