# ADR 0001 — Monorepo with pnpm workspaces + Turborepo

- **Status:** Accepted
- **Date:** 2026-08-31
- **Deciders:** founding engineering
- **Related:** `01-tech-stack.md`, `17-infrastructure-devops.md`

## Context

We will have multiple frontends (storefront, seller, admin), a backend that will
grow from one Nest app into several services, and a lot of shared code:
validation schemas / API types, a UI component library, auth/RBAC constants,
event definitions, observability bootstrap, lint/tsconfig. The team is small and
everything is TypeScript. We need fast CI and the ability to make cross-cutting
changes (e.g. change an API contract and every consumer) atomically.

## Options considered

### Option A — Polyrepo (one repo per app/service/package)
- Pros: hard isolation; independent CI; clear ownership per repo.
- Cons: shared code via published packages → version drift, "update the type in 6
  repos" PRs, cross-repo changes can't be atomic or reviewed together; heavier
  tooling to keep consistent; slower for a small team.

### Option B — Monorepo, npm/yarn workspaces only
- Pros: shared code is local; atomic changes; one CI config.
- Cons: no build caching / task graph → CI rebuilds/tests everything on every
  change; gets slow fast.

### Option C — Monorepo with pnpm workspaces + Turborepo
- Pros: local shared packages + atomic cross-cutting changes; pnpm's strict,
  fast, disk-efficient installs; Turbo task graph + remote cache builds/tests
  only what changed; `--filter` for affected-only CI; one lint/tsconfig/CI setup;
  still deploy each app independently (separate images/pipelines).
- Cons: single repo can grow large; need discipline on package boundaries;
  everyone needs the whole repo checked out; Turbo cache infra to run.

## Decision

We will use a **monorepo** managed by **pnpm workspaces + Turborepo**, with
`apps/*` (deployables) and `packages/*` (shared libraries), and a shared
`infra/` directory. Each app keeps its own Dockerfile and deploy pipeline;
services stay independently deployable even though they live in one repo.

## Consequences

- Positive: one source of truth for API contracts and UI; refactors span
  FE+BE in one reviewed PR; fast CI via affected-only + remote cache; consistent
  tooling.
- Negative / trade-offs: must enforce package boundaries (lint rules, no deep
  imports); repo size and clone time grow; need a Turbo remote cache (CI
  provider or self-hosted); a bad shared-package change can affect everything —
  mitigated by tests + CODEOWNERS on `packages/*`.
- Follow-up: define `CODEOWNERS`; set up Turbo remote cache; ESLint boundary
  rules; per-app release tagging (Conventional Commits).
- Revisit if: the org grows to many teams with conflicting release cadences and
  the coordination cost of one repo outweighs the sharing benefit — then split
  the most independent apps out first.
