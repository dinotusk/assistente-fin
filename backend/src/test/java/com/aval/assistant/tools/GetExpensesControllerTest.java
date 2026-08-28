package com.aval.assistant.tools;

import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.aval.finance.Money;
import com.aval.finance.expenses.EntryType;
import com.aval.finance.expenses.ExpensePage;
import com.aval.finance.expenses.ExpenseStatus;
import com.aval.finance.expenses.FinancialEntry;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class GetExpensesControllerTest {

  @Autowired private MockMvc mockMvc;

  @MockitoBean private GetExpensesTool tool;

  @Test
  void withoutTokenIsRejected() throws Exception {
    mockMvc
        .perform(get("/api/v1/tools/expenses").param("month", "2026-08").param("scope", "household"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.type", is("AUTHENTICATION_REQUIRED")));
  }

  @Test
  void validRequestReturnsMappedPage() throws Exception {
    FinancialEntry entry =
        new FinancialEntry(
            UUID.randomUUID(),
            UUID.randomUUID(),
            "Mercado",
            EntryType.EXPENSE,
            "Alimentação",
            Money.of("500"),
            ExpenseStatus.PAID,
            LocalDate.of(2026, 8, 10),
            null);
    when(tool.execute(any(), eq(YearMonth.of(2026, 8)), any(), any(), any(), any(), anyInt(), anyInt()))
        .thenReturn(new ExpensePage(List.of(entry), 0, 50, false));

    mockMvc
        .perform(get("/api/v1/tools/expenses").param("month", "2026-08").param("scope", "household").with(jwt()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.hasMore", is(false)))
        .andExpect(jsonPath("$.items[0].category", is("Alimentação")))
        .andExpect(jsonPath("$.items[0].amount.value", is("500.00")))
        .andExpect(jsonPath("$.items[0].amount.provenance", is("RECORDED")))
        .andExpect(jsonPath("$.items[0].type", is("EXPENSE")));
  }

  @Test
  void invalidStatusIsValidationError() throws Exception {
    mockMvc
        .perform(
            get("/api/v1/tools/expenses")
                .param("month", "2026-08")
                .param("scope", "household")
                .param("status", "quitado")
                .with(jwt()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.type", is("VALIDATION_ERROR")));
  }

  @Test
  void pageSizeOutOfRangeIsValidationError() throws Exception {
    mockMvc
        .perform(
            get("/api/v1/tools/expenses")
                .param("month", "2026-08")
                .param("scope", "household")
                .param("pageSize", "500")
                .with(jwt()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.type", is("VALIDATION_ERROR")));
  }
}
