package com.aval.platform.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * OpenAPI metadata + the Bearer JWT security scheme every protected endpoint
 * documents itself against. Swagger UI is only actually reachable outside
 * the production profile — see application-production.yml.
 */
@Configuration
public class OpenApiConfig {

  private static final String BEARER_SCHEME = "supabaseBearerAuth";

  @Bean
  public OpenAPI avalOpenApi() {
    return new OpenAPI()
        .info(
            new Info()
                .title("Aval API")
                .description(
                    "Aval V1 backend foundation. This round ships only diagnostic "
                        + "endpoints — see backend/README.md for what has and hasn't "
                        + "been migrated from the PWA yet.")
                .version("v1"))
        .components(
            new Components()
                .addSecuritySchemes(
                    BEARER_SCHEME,
                    new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")
                        .description("Supabase Auth access token.")))
        .addSecurityItem(new SecurityRequirement().addList(BEARER_SCHEME));
  }
}
