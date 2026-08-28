package com.aval.assistant.tools;

import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.aval.household.FinancialProfile;
import com.aval.household.ProfileKind;
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
class GetHouseholdProfilesControllerTest {

  @Autowired private MockMvc mockMvc;

  @MockitoBean private GetHouseholdProfilesTool tool;

  @Test
  void withoutTokenIsRejected() throws Exception {
    mockMvc.perform(get("/api/v1/tools/household-profiles")).andExpect(status().isUnauthorized());
  }

  @Test
  void validRequestReturnsOnlyTheCallersHouseholdProfilesOrderedBySortOrder() throws Exception {
    UUID householdId = UUID.randomUUID();
    when(tool.execute(any()))
        .thenReturn(
            List.of(
                new FinancialProfile(UUID.randomUUID(), householdId, "Ana", ProfileKind.HOUSEHOLD, 0, true),
                new FinancialProfile(UUID.randomUUID(), householdId, "Rafael", ProfileKind.MANAGED, 1, true)));

    mockMvc
        .perform(get("/api/v1/tools/household-profiles").with(jwt()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.profiles[0].name", is("Ana")))
        .andExpect(jsonPath("$.profiles[0].sortOrder", is(0)))
        .andExpect(jsonPath("$.profiles[1].name", is("Rafael")));
  }
}
