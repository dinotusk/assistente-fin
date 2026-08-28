package com.aval.platform.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.PlainJWT;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Date;
import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import tools.jackson.databind.ObjectMapper;

/**
 * Exercises the real {@link JwtDecoder} bean {@link SecurityConfig#jwtDecoder} builds — no
 * network, no Spring context: a plain JDK {@link HttpServer} on loopback serves a fixed JWKS, and
 * every token is signed for real with Nimbus JOSE. Deliberately does NOT use Spring Security
 * Test's {@code jwt()} MockMvc post-processor for this — that bypasses this exact bean, which is
 * how the ES256/RS256 gap and the {@code aud} List-vs-String gap this class was written for both
 * went undetected through P1-P6 (see SecurityConfig#jwtDecoder's javadoc).
 */
class SecurityConfigJwtDecoderTest {

  private static final String KID = "test-kid-es256";
  private static final String ISSUER = "https://test-issuer.example/auth/v1";
  private static final String AUDIENCE = "authenticated";

  private static HttpServer jwksServer;
  private static String jwksUrl;
  private static ECKey signingKey;

  private JwtDecoder decoder;

  @BeforeAll
  static void startJwksServer() throws Exception {
    signingKey = new ECKeyGenerator(Curve.P_256).keyID(KID).generate();
    String jwksJson = new JWKSet(signingKey.toPublicJWK()).toString();

    jwksServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    jwksServer.createContext(
        "/jwks",
        exchange -> {
          byte[] body = jwksJson.getBytes(StandardCharsets.UTF_8);
          exchange.getResponseHeaders().add("Content-Type", "application/json");
          exchange.sendResponseHeaders(200, body.length);
          try (OutputStream os = exchange.getResponseBody()) {
            os.write(body);
          }
        });
    jwksServer.start();
    jwksUrl = "http://127.0.0.1:" + jwksServer.getAddress().getPort() + "/jwks";
  }

  @AfterAll
  static void stopJwksServer() {
    jwksServer.stop(0);
  }

  @BeforeEach
  void setUp() {
    AvalProperties properties =
        new AvalProperties(null, new AvalProperties.Supabase(AUDIENCE), null);
    SecurityConfig securityConfig = new SecurityConfig(new ObjectMapper(), properties);
    decoder = securityConfig.jwtDecoder(jwksUrl, ISSUER);
  }

  @Test
  void acceptsValidEs256TokenWithMatchingIssuerAndAudience() throws Exception {
    String token = tokenBuilder().sign();

    Jwt jwt = decoder.decode(token);

    assertThat(jwt.getSubject()).isEqualTo("user-123");
    assertThat(jwt.getAudience()).containsExactly(AUDIENCE);
  }

  @Test
  void rejectsTokenWithSignatureFromAnUnpublishedKey() throws Exception {
    ECKey impostorKey = new ECKeyGenerator(Curve.P_256).keyID(KID).generate();
    String token = tokenBuilder().signWith(impostorKey);

    assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtException.class);
  }

  @Test
  void rejectsWrongAudience() throws Exception {
    String token = tokenBuilder().audience("some-other-audience").sign();

    assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtException.class);
  }

  @Test
  void rejectsMissingAudience() throws Exception {
    String token = tokenBuilder().noAudience().sign();

    assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtException.class);
  }

  @Test
  void rejectsEmptyAudience() throws Exception {
    String token = tokenBuilder().audiences(List.of()).sign();

    assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtException.class);
  }

  @Test
  void acceptsMultiValueAudienceContainingTheRequiredOne() throws Exception {
    String token = tokenBuilder().audiences(List.of("some-other-app", AUDIENCE)).sign();

    Jwt jwt = decoder.decode(token);

    assertThat(jwt.getAudience()).containsExactlyInAnyOrder("some-other-app", AUDIENCE);
  }

  @Test
  void rejectsWrongIssuer() throws Exception {
    String token = tokenBuilder().issuer("https://not-the-real-issuer.example/auth/v1").sign();

    assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtException.class);
  }

  @Test
  void rejectsExpiredToken() throws Exception {
    String token = tokenBuilder().expiredOneHourAgo().sign();

    assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtException.class);
  }

  @Test
  void rejectsRs256TokenEvenWhenWellFormed() throws Exception {
    // Restricted to ES256 by policy (SecurityConfig#jwtDecoder) — must reject on algorithm alone,
    // independent of whether an RSA key even exists in the JWKS (it deliberately doesn't).
    RSAKey rsaKey = new RSAKeyGenerator(2048).keyID(KID).generate();
    SignedJWT rs256Jwt =
        new SignedJWT(
            new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(KID).type(JOSEObjectType.JWT).build(),
            tokenBuilder().claims());
    rs256Jwt.sign(new RSASSASigner(rsaKey));

    assertThatThrownBy(() -> decoder.decode(rs256Jwt.serialize())).isInstanceOf(JwtException.class);
  }

  @Test
  void rejectsHs256TokenEvenWhenWellFormed() throws Exception {
    byte[] secret = new byte[32];
    new SecureRandom().nextBytes(secret);
    SignedJWT hs256Jwt =
        new SignedJWT(
            new JWSHeader.Builder(JWSAlgorithm.HS256).keyID(KID).type(JOSEObjectType.JWT).build(),
            tokenBuilder().claims());
    hs256Jwt.sign(new MACSigner(secret));

    assertThatThrownBy(() -> decoder.decode(hs256Jwt.serialize())).isInstanceOf(JwtException.class);
  }

  @Test
  void rejectsUnsignedAlgNoneToken() throws Exception {
    String token = new PlainJWT(tokenBuilder().claims()).serialize();

    assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtException.class);
  }

  private TokenBuilder tokenBuilder() {
    return new TokenBuilder();
  }

  /** Small fluent builder so each test only overrides the one claim it's exercising. */
  private static final class TokenBuilder {
    private String issuer = ISSUER;
    private List<String> audience = List.of(AUDIENCE);
    private Date expiresAt = Date.from(java.time.Instant.now().plusSeconds(3600));

    TokenBuilder issuer(String issuer) {
      this.issuer = issuer;
      return this;
    }

    /** Single-value audience, written to the wire as a bare string — Supabase's real shape. */
    TokenBuilder audience(String audience) {
      this.audience = audience == null ? null : List.of(audience);
      return this;
    }

    /** Multi-value audience, written to the wire as a JSON array. */
    TokenBuilder audiences(List<String> audiences) {
      this.audience = audiences;
      return this;
    }

    TokenBuilder noAudience() {
      this.audience = null;
      return this;
    }

    TokenBuilder expiredOneHourAgo() {
      this.expiresAt = Date.from(java.time.Instant.now().minusSeconds(3600));
      return this;
    }

    JWTClaimsSet claims() {
      JWTClaimsSet.Builder builder =
          new JWTClaimsSet.Builder()
              .subject("user-123")
              .issuer(issuer)
              .issueTime(Date.from(java.time.Instant.now().minusSeconds(60)))
              .expirationTime(expiresAt);
      if (audience != null) {
        // Deliberately raw claim(), not .audience(...) — Nimbus's .audience(String) builder
        // always serializes `aud` as a JSON array, but Supabase's real tokens carry a single
        // audience as a bare string (confirmed against a real decoded token). A single-element
        // list mirrors that exact wire shape; multi-element writes a real JSON array.
        builder.claim("aud", audience.size() == 1 ? audience.get(0) : audience);
      }
      return builder.build();
    }

    String sign() throws Exception {
      return signWith(signingKey);
    }

    String signWith(ECKey key) throws Exception {
      SignedJWT jwt =
          new SignedJWT(
              new JWSHeader.Builder(JWSAlgorithm.ES256)
                  .keyID(KID)
                  .type(JOSEObjectType.JWT)
                  .build(),
              claims());
      jwt.sign(new ECDSASigner(key));
      return jwt.serialize();
    }
  }
}
