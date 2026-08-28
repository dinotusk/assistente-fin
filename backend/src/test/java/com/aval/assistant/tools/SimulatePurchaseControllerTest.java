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
import com.aval.finance.simulations.PurchaseSimulationCalculator;
import com.aval.finance.simulations.PurchaseSimulationResult;
import java.time.YearMonth;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class SimulatePurchaseControllerTest {

  @Autowired private MockMvc mockMvc;

  @MockitoBean private SimulatePurchaseTool tool;

  @Test
  void withoutTokenIsRejected() throws Exception {
    mockMvc
        .perform(
            post("/api/v1/tools/simulate-purchase")
                .contentType("application/json")
                .content("{\"month\":\"2026-08\",\"scope\":\"household\",\"purchaseAmount\":\"100\"}"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void validRequestReturnsMappedResult() throws Exception {
    PurchaseSimulationResult result =
        PurchaseSimulationCalculator.simulate(Money.of("500"), 1, Money.of("5000"), Money.of("1000"), Money.of("4000"));
    when(tool.execute(any(), eq(YearMonth.of(2026, 8)), any(), eq(Money.of("500")), eq(1))).thenReturn(result);

    mockMvc
        .perform(
            post("/api/v1/tools/simulate-purchase")
                .contentType("application/json")
                .content("{\"month\":\"2026-08\",\"scope\":\"household\",\"purchaseAmount\":\"500\"}")
                .with(jwt()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.isHypothetical", is(true)))
        .andExpect(jsonPath("$.status", is("FEASIBLE")))
        .andExpect(jsonPath("$.purchaseAmount.value", is("500.00")))
        .andExpect(jsonPath("$.purchaseAmount.provenance", is("INPUT")))
        .andExpect(jsonPath("$.projectedFree.value", is("3500.00")));
  }

  @Test
  void zeroPurchaseAmountIsValidationError() throws Exception {
    mockMvc
        .perform(
            post("/api/v1/tools/simulate-purchase")
                .contentType("application/json")
                .content("{\"month\":\"2026-08\",\"scope\":\"household\",\"purchaseAmount\":\"0\"}")
                .with(jwt()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.type", is("VALIDATION_ERROR")));
  }

  @Test
  void zeroInstallmentsIsValidationError() throws Exception {
    mockMvc
        .perform(
            post("/api/v1/tools/simulate-purchase")
                .contentType("application/json")
                .content("{\"month\":\"2026-08\",\"scope\":\"household\",\"purchaseAmount\":\"100\",\"installments\":0}")
                .with(jwt()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.type", is("VALIDATION_ERROR")));
  }
}
