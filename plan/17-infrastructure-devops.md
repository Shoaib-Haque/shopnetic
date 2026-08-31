# 17 — Infrastructure & DevOps

Status: DRAFT
Related: `adr/0001-monorepo.md`, `02-architecture.md`, `18-observability.md`

## 1. Repository layout (monorepo — ADR-0001)

```
shopnetic/
  apps/
    storefront/          # Next.js
    seller/              # Next.js
    admin/               # Next.js
    api/                 # NestJS (modular monolith: all bounded-context modules)
    realtime/            # Socket.IO gateway (extracted early)
    search-indexer/      # worker
    workers/             # BullMQ processors (payouts, emails, exports, reindex)
  packages/
    contracts/           # Zod schemas + generated OpenAPI + typed client
    ui/                  # shadcn component library + tokens
    auth/                # token verify, RBAC guard, permission constants
    events/              # event names + payload schemas + pub/sub helpers
    observability/       # logger, tracing, metrics bootstrap
    config/              # eslint, tsconfig, tailwind preset, prettier
    db/                  # prisma schema(s), migrations, seed
  infra/
    terraform/           # cloud resources per env
    k8s/                 # helm charts / kustomize overlays
    docker/              # base images, compose for local
  .github/workflows/     # CI/CD
  turbo.json  pnpm-workspace.yaml
```

- **pnpm workspaces + Turborepo**: cached builds/tests, `--filter` affected-only
  in CI, one dependency graph, atomic cross-cutting PRs.
- One version, trunk-based; short-lived feature branches; PR required; no direct
  push to `main`.
- Conventional Commits → automated changelog + semantic version tags per app.

## 2. Local development

- `docker compose up` brings: Postgres, Redis, RabbitMQ, Meilisearch/OpenSearch,
  MinIO (S3), Mailpit (email), plus the apps in watch mode.
- One `pnpm dev` (Turbo) runs everything; `.env.example` committed, real `.env`
  gitignored, secrets pulled from the secret manager via CLI for those who need them.
- `pnpm db:migrate && pnpm db:seed` — deterministic seed (categories, demo
  sellers/products/buyers, staff accounts, feature flags).
- Pre-commit (lefthook/husky): lint-staged, typecheck changed, format, secret scan.

## 3. Build & artifacts

- Multi-stage Dockerfiles per app; distroless/alpine runtime; non-root; healthcheck.
- Next.js apps: `output: 'standalone'`; static assets to CDN bucket at deploy.
- Images tagged with git SHA (+ semver for releases); pushed to a private registry;
  scanned (Trivy) — build fails on High/Critical with no waiver.
- SBOM generated per image.
- Prisma client generated in build; migrations shipped as a separate job image.

## 4. Environments

| Env | Infra | Purpose | Promotion |
|-----|-------|---------|-----------|
| `local` | docker-compose | dev | — |
| `preview` | ephemeral namespace per PR (or Vercel preview for FE + shared api-preview) | review, E2E, visual diff | auto on PR |
| `staging` | full stack, prod-like, smaller | pre-prod verification, load tests, migration rehearsal | auto on merge to `main` |
| `production` | full stack, HA, multi-AZ | live | manual approval / tag |

Config via env vars + secret manager; **12-factor**; no env-specific code paths
beyond config. Feature flags decouple deploy from release.

## 5. Orchestration (Kubernetes, managed — EKS/GKE/AKS)

- One namespace per environment; per-service `Deployment` + `Service` +
  `HorizontalPodAutoscaler` (CPU + custom metrics: queue depth, RPS, socket count).
- Resource requests/limits per service; `PodDisruptionBudget`; anti-affinity
  across nodes/AZs; `topologySpreadConstraints`.
- Rolling updates with readiness gates; `preStop` drain + `terminationGracePeriod`
  (critical for realtime + in-flight requests).
- Probes: `liveness` (am I deadlocked), `readiness` (can I serve), `startup`
  (slow boot). Every service implements `/healthz` + `/readyz`.
- Ingress: managed LB → Ingress controller (Traefik/NGINX) or a gateway (Kong)
  for TLS, routing, global rate limit, WAF; cert-manager for TLS.
- NetworkPolicies: default-deny; explicit allow per service dependency.
- Jobs/CronJobs: payout runs, sitemap regen, reconciliation, full reindex,
  retention/erasure sweeps, cache warmers, DB vacuum/analyze checks.
- Managed data services (RDS/Cloud SQL Postgres, ElastiCache/MemoryStore Redis,
  Amazon MQ / CloudAMQP, managed OpenSearch, S3 + CloudFront) — don't self-host
  stateful infra early.

## 6. Data / DB operations

- **Migrations**: Prisma Migrate, forward-only, reviewed; run as a pre-deploy
  Job; **expand/contract** pattern for zero-downtime (add nullable → backfill →
  switch reads → drop old in a later release). Never a breaking migration in the
  same deploy as the code that needs it.
- Migration rehearsal on a staging clone of prod-sized data; measure lock time.
- Connection pooling: PgBouncer (transaction mode) in front of Postgres; per-
  service pool caps.
- Backups: automated daily + PITR (WAL) ≥ 7–30 days; cross-region copy; monthly
  restore drill; documented RPO/RTO (→ `20`).
- Read replicas for reporting/analytics and heavy read endpoints (never for
  checkout/ledger).
- Per-context schema; a future extraction = point the module at its own DB
  instance + move the schema.

## 7. CI/CD (GitHub Actions)

**PR pipeline** (fast, on every push):
1. Install (pnpm cache) → `turbo run lint typecheck test build --filter=...[HEAD^]`
2. Unit + component tests (Vitest) with coverage gate.
3. Contract tests (OpenAPI/Pact) — FE↔BFF↔services.
4. Security: SAST (Semgrep/CodeQL), secret scan (gitleaks), `pnpm audit`,
   IaC scan, Dockerfile lint.
5. Build images (affected apps) → scan (Trivy).
6. Spin **preview env** → run Playwright E2E smoke + Lighthouse-CI + axe.
7. Visual regression on `packages/ui`.

**Merge to `main`**:
8. Build + push images (SHA tag).
9. Deploy to **staging** (migrations Job → rolling deploy) → post-deploy smoke +
   synthetic checks.
10. Full E2E suite + load test (nightly or on release branch).

**Release to production**:
11. Manual approval (or tag `v*`). Progressive delivery: **canary** (5% → 25% →
    100%) or blue/green for risky changes; automated rollback on SLO breach
    (error rate, latency, saturation) via Argo Rollouts / Flagger.
12. Migrations Job first (expand phase already shipped previously).
13. Post-deploy verification + release marker in Sentry/Grafana; changelog published.

- **Rollback**: keep last N images; `kubectl rollout undo` / re-point canary;
  DB never rolled back — forward-fix (that's why expand/contract).
- Deploy frequency target: multiple/day to staging, daily+ to prod once stable.

## 8. Infrastructure as Code

- **Terraform** for all cloud resources (VPC, clusters, DBs, caches, buckets,
  CDN, DNS, IAM, secrets, WAF). State in remote backend with locking; one
  workspace/dir per env; `plan` on PR, `apply` gated.
- Kubernetes manifests via Helm or Kustomize overlays per env; ArgoCD/Flux for
  **GitOps** (cluster state = git).
- No click-ops in prod; emergency manual changes reconciled back into IaC within 24h.
- DNS + CDN + WAF config also in code.

## 9. Networking & DNS

- `www` / apex → CDN → storefront; `seller.` / `admin.` → gateway (separate
  origins, stricter WAF, no CDN HTML caching). `api.` → gateway.
- Internal traffic stays in-VPC / mesh; databases not publicly routable.
- Optional service mesh (Linkerd) if mTLS + traffic-splitting + retries at the
  platform layer become worth the overhead (defer).

## 10. Cost & capacity

- Autoscaling with sane floors/ceilings; scale-to-low (not zero) for core
  services; scale workers on queue depth.
- Spot/preemptible nodes for stateless workers + CI; on-demand for core.
- Budget alerts; per-service cost attribution via labels.
- Load test → capacity model → set HPA targets and DB sizing (→ `20`).

## 11. Runbooks (one per service, in-repo)

Deploy, rollback, scale, common alerts + first response, dependency map,
dashboards + SLOs, on-call escalation, data-fix procedures, DR steps.
