package com.aval.assistant.tools;

import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.aval.finance.Money;
import com.aval.finance.goals.GoalView;
import com.aval.finance.goals.Priority;
import com.aval.finance.goals.PriorityCalculator;
import com.aval.finance.goals.PriorityStatus;
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
class GetGoalsControllerTest {

  @Autowired private MockMvc mockMvc;

  @MockitoBean private GetGoalsTool tool;

  @Test
  void withoutTokenIsRejected() throws Exception {
    mockMvc
        .perform(get("/api/v1/tools/goals").param("month", "2026-08").param("scope", "household"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.type", is("AUTHENTICATION_REQUIRED")));
  }

  @Test
  void validRequestReturnsMappedGoalWithProgress() throws Exception {
    UUID profileId = UUID.randomUUID();
    Priority priority =
        new Priority(
            UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), profileId, "Viagem",
            Money.of("1000"), Money.of("400"), 1, PriorityStatus.PENDING);
    GoalView view = PriorityCalculator.toView(priority);
    when(tool.execute(any(), any(), any())).thenReturn(List.of(view));

    mockMvc
        .perform(get("/api/v1/tools/goals").param("month", "2026-08").param("scope", "household").with(jwt()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].description", is("Viagem")))
        .andExpect(jsonPath("$.items[0].targetAmount.value", is("1000.00")))
        .andExpect(jsonPath("$.items[0].targetAmount.provenance", is("RECORDED")))
        .andExpect(jsonPath("$.items[0].remaining.value", is("600.00")))
        .andExpect(jsonPath("$.items[0].remaining.provenance", is("CALCULATED")))
        .andExpect(jsonPath("$.items[0].progress.status", is("OK")))
        .andExpect(jsonPath("$.items[0].progress.value", is("40.00")))
        .andExpect(jsonPath("$.items[0].status", is("PENDING")));
  }
}
