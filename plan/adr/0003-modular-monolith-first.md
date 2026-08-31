# ADR 0003 — Modular monolith first, extract services on trigger

- **Status:** Accepted
- **Date:** 2026-08-31
- **Deciders:** founding engineering
- **Related:** `02-architecture.md`, `21-roadmap-milestones.md`, `07-data-model.md`

## Context

The product brief asks for "microservices so we can scale later". Scaling
readiness is a real requirement (many sellers, flash-sale spikes, independent
scaling of search/realtime). But the team is small and there is no traffic yet.
Starting with 10+ independently deployed services means paying — from day one —
for network partitions, eventual consistency everywhere, distributed tracing to
debug anything, schema/contract choreography across repos of deploys, and much
slower feature delivery. Most early-stage "microservice" projects that fail, fail
here.

We want the *option* of microservices without the *tax* before we need it.

## Options considered

### Option A — Microservices from day one
- Pros: "correct" boundaries enforced by the network; independent scaling/deploy
  immediately; teams could own services.
- Cons: massive upfront complexity for a pre-launch product; every feature
  crosses services; local dev and testing are hard; slow iteration; small team
  spread thin on infra; premature boundary decisions are expensive to move.

### Option B — Big-ball-of-mud monolith
- Pros: fastest to start.
- Cons: no boundaries → coupling accretes → extraction later is a rewrite;
  can't scale sub-domains independently; exactly the outcome the brief wants to
  avoid.

### Option C — Modular monolith with hard internal boundaries + planned extraction
- Pros: one deployable, one repo section, one DB instance, simple local dev and
  transactions → fast iteration now. Boundaries are still enforced (module per
  bounded context, schema per context, no cross-schema FKs, communication only
  via published interfaces + domain events, outbox + idempotency from day one).
  Extracting a module to its own service becomes a deployment/infra change, not a
  redesign. Search, Realtime, Notifications can be split out early because they
  genuinely need it.
- Cons: requires discipline (it's easy to "just import that table"); needs lint/
  review guardrails; some duplication (read-model copies) done earlier than
  strictly necessary; team must understand the boundaries are load-bearing.

## Decision

We will build the backend as a **modular monolith**: one deployable Nest app
whose modules map 1:1 to the bounded contexts in `02-architecture.md`, each with
its **own Postgres schema**, communicating only through published service
interfaces and **domain events**, using the **outbox pattern** and
**idempotency keys** for every cross-context write from the start.

We will **extract a module into its own deployable service when a concrete
trigger fires**:

1. It needs to scale independently of the rest.
2. It has a materially different availability/latency requirement.
3. A separate team owns it and release cadence conflicts.
4. Its resource use starves co-located modules.

Search, Realtime Gateway, and Notifications are expected to be extracted early
(triggers 1 and 2). Everything else stays in-process until it earns its own box.

## Consequences

- Positive: fast feature delivery pre-launch; simple transactions across contexts
  while co-located; cheap local dev/test; boundaries still real, so scaling later
  is incremental, not a rewrite; we can point to specific triggers instead of
  arguing about it repeatedly.
- Negative / trade-offs: discipline cost (guardrails: ESLint boundaries, schema
  ownership, `CODEOWNERS`, review on cross-module calls); we implement outbox,
  event schemas, idempotency, and some read-model duplication before it's
  strictly required; a careless import can violate a boundary silently without
  tooling to catch it.
- Follow-up: enforce module boundaries in ESLint; one schema per context in
  Prisma; outbox + relay scaffold in Phase 0; event catalog in
  `@shopnetic/events`; document each context's public interface; add extraction
  runbook (how to split a module → service: carve schema to its own DB, swap
  in-process calls for RPC/HTTP, move event bus from in-process to broker).
- Revisit / trigger review: at each phase boundary, check every context against
  the four triggers; extract the ones that qualify. Also revisit if the
  in-process event bus becomes a bottleneck (move to RabbitMQ/NATS) or if a
  single Postgres instance nears capacity (split schemas to separate instances).
