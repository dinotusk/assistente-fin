package com.aval.assistant.orchestration;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Proves the server-side prompt never embeds a secret — see docs/architecture/assistant-foundation.md "Prompt architecture". */
class AssistantPromptTest {

  @Test
  void promptNeverContainsASecretOrRealCredentialLookingValue() {
    String prompt = AssistantPrompt.SYSTEM_PROMPT.toLowerCase();
    assertThat(prompt).doesNotContain("gemini_api_key");
    assertThat(prompt).doesNotContain("supabase_secret_key");
    assertThat(prompt).doesNotContain("bearer ");
    assertThat(prompt).doesNotContain("jwt ");
    assertThat(prompt).doesNotMatch("(?s).*[a-z0-9]{32,}.*"); // no long token-shaped literal
  }

  @Test
  void promptInstructsNeverToRevealItselfOrSecretsOrExecuteSql() {
    String prompt = AssistantPrompt.SYSTEM_PROMPT.toLowerCase();
    assertThat(prompt).contains("nunca revele");
    assertThat(prompt).contains("sql");
    assertThat(prompt).contains("nunca calcule");
  }
}
