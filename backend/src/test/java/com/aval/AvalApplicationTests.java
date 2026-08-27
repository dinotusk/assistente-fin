package com.aval;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Proves the whole application context wires up correctly — every
 * {@code @Configuration}/{@code @Bean}/{@code @Component} in the app,
 * including {@link com.aval.platform.config.SecurityConfig}'s JwtDecoder
 * and CORS wiring. Deliberately does NOT require a reachable database (see
 * application.yml's {@code hikari.initialization-fail-timeout: -1}) or a
 * real Supabase project (the JwtDecoder's JWKS URL is only fetched lazily,
 * on first token verification) — this test should be fast and always
 * runnable, independent of external infrastructure.
 */
@SpringBootTest
class AvalApplicationTests {

  @Test
  void contextLoads() {}
}
