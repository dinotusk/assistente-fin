# syntax=docker/dockerfile:1
#
# Multi-stage build — the final image ships only a JRE and the built jar,
# never Maven, never source, never a build cache, and no secret is ever
# baked in (see backend/README.md "Docker" for how env vars are supplied at
# runtime instead).

# ---- Build stage ----
FROM eclipse-temurin:25-jdk AS build
WORKDIR /workspace

COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -B dependency:go-offline

COPY src/ src/
RUN ./mvnw -B -DskipTests package

# ---- Runtime stage ----
FROM eclipse-temurin:25-jre AS runtime

# curl only for the HEALTHCHECK below — nothing else needs it at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system aval && useradd --system --gid aval --home /app aval
WORKDIR /app

COPY --from=build /workspace/target/aval-backend.jar app.jar
RUN chown -R aval:aval /app
USER aval

EXPOSE 8081

# Sensible container defaults — G1GC and a percentage-based heap cap so the
# JVM behaves reasonably under whatever memory limit the orchestrator sets,
# without hand-tuning -Xmx per environment.
ENV JAVA_OPTS="-XX:+UseG1GC -XX:MaxRAMPercentage=75"
ENV SERVER_PORT=8081

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -fsS "http://localhost:${SERVER_PORT}/api/v1/health" || exit 1

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
