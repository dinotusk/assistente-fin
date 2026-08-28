package com.aval.assistant.tools;

import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.aval.finance.Money;
import com.aval.finance.Percent;
import com.aval.finance.summary.MonthComparisonResult;
import com.aval.finance.summary.ProvenancedMoney;
import com.aval.household.FinancialScope;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class CompareMonthsControllerTest {

  @Autowired private MockMvc mockMvc;

  @MockitoBean private CompareMonthsTool tool;

  private static com.aval.finance.summary.FinancialSummary summary(YearMonth month, String total) {
    return new com.aval.finance.summary.FinancialSummary(
        new FinancialScope.Household(),
        month,
        ProvenancedMoney.calculated(Money.of("5500")),
        ProvenancedMoney.calculated(Money.of(total)),
        ProvenancedMoney.calculated(Money.ZERO),
        ProvenancedMoney.calculated(Money.ZERO),
        ProvenancedMoney.calculated(Money.ZERO),
        ProvenancedMoney.calculated(Money.of("3900")),
        Optional.empty());
  }

  @Test
  void withoutTokenIsRejected() throws Exception {
    mockMvc
        .perform(
            get("/api/v1/tools/compare-months")
                .param("monthA", "2026-07")
                .param("monthB", "2026-08")
                .param("scope", "household"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.type", is("AUTHENTICATION_REQUIRED")));
  }

  @Test
  void zeroBaselineProducesNotApplicablePercentNeverAFabricatedNumber() throws Exception {
    when(tool.execute(any(), any(), any(), any()))
        .thenReturn(
            new MonthComparisonResult(
                summary(YearMonth.of(2026, 7), "0"),
                summary(YearMonth.of(2026, 8), "1000"),
                List.of(),
                List.of(),
                List.of(),
                Money.of("1000"),
                Percent.ofDelta(Money.of("1000").value(), Money.ZERO.value()),
                Money.ZERO,
                Percent.ofDelta(java.math.BigDecimal.ZERO, Money.of("5500").value()),
                Money.ZERO,
                Percent.ofDelta(java.math.BigDecimal.ZERO, Money.of("3900").value()),
                Money.ZERO,
                Percent.ofDelta(java.math.BigDecimal.ZERO, Money.ZERO.value())));

    mockMvc
        .perform(
            get("/api/v1/tools/compare-months")
                .param("monthA", "2026-07")
                .param("monthB", "2026-08")
                .param("scope", "household")
                .with(jwt()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.expensesDeltaPercent.status", is("NOT_APPLICABLE")))
        .andExpect(jsonPath("$.expensesDeltaPercent.value", nullValue()))
        .andExpect(jsonPath("$.expensesDelta.value", is("1000.00")));
  }

  @Test
  void invalidMonthFormatIsValidationError() throws Exception {
    mockMvc
        .perform(
            get("/api/v1/tools/compare-months")
                .param("monthA", "julho")
                .param("monthB", "2026-08")
                .param("scope", "household")
                .with(jwt()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.type", is("VALIDATION_ERROR")));
  }
}
