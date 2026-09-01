# @shopnetic/admin

Back office. Next.js (App Router). Separate subdomain **and** an obfuscated base
route segment (`ADMIN_BASE_PATH`, default `x7f2k9t3m1qp`).

```bash
pnpm --filter @shopnetic/admin dev
# dashboard: http://localhost:3002/en/x7f2k9t3m1qp/login
# locale root (http://localhost:3002/en) intentionally 404s
```

Enforcement order (`plan/23` §3): `src/proxy.ts` → `(protected)/layout.tsx`
server session check → `authorize()` on every action. The obfuscated segment is
defense-in-depth only, never the sole control.

Skeleton: stub login + stub protected dashboard. Real auth = Phase 0; back-office
modules = Phase 2+ (`plan/06`, `plan/21`).
