# ADR-001 — Modular monolith, not microservices

**Status:** Accepted — P1-SPRING-BOOT-FOUNDATION

## Context

Aval V1 needs a backend that can grow to host a financial domain,
simulation engine, AI orchestrator, and Open Finance integration, while
serving both the existing PWA and a future React Native/Expo client.

## Decision

Build one Spring Boot application (`backend/`), organized as a modular
monolith: distinct Java packages per bounded context
(`household`, `finance`, `assistant`, `openfinance`, `platform`), each
package boundary treated as if it could become a separate service later,
but deployed and run as a single process today.

## Why not microservices

- The product is a single small team building one coherent product, not
  several teams needing independent deploy cadences.
- Microservices would add network calls, distributed transactions, and
  operational overhead (service discovery, inter-service auth, distributed
  tracing) for zero benefit at this stage — pure "enterprise theater"
  the roadmap explicitly warns against.
- A modular monolith with clean package boundaries is easier to split
  later, if and when a real scaling or team-ownership reason appears, than
  a premature microservice split is to undo.

## Consequences

- Package boundaries are enforced by convention and code review, not by
  network/process isolation. This is a real tradeoff — a determined
  developer *can* reach across boundaries — accepted deliberately in
  exchange for far lower operational complexity.
- Business modules (`finance`, `assistant`, `openfinance`) exist this round
  only as `package-info.java` boundary markers with no implementation — see
  P1's own scope restrictions. They get real content starting
  P2-FINANCIAL-DOMAIN.
