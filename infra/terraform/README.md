# infra/terraform

**Deferred.** Cloud provider not chosen yet (`plan/22` Q9) — the project is
local-first for now (`docker compose` in `infra/docker/`).

When a staging environment is needed:

- pick the provider,
- write modules here (VPC, k8s cluster, managed Postgres, Redis, object storage,
  CDN, DNS, secrets, WAF) per `plan/17-infrastructure-devops.md` section 8,
- remote state backend with locking, one workspace/dir per environment,
- `plan` on PR, gated `apply`.
