# @shopnetic/auth

RBAC primitives shared by every service, plus password hashing.

See `plan/03-users-and-rbac.md` and `plan/16-security.md`.

## Exports

| Symbol                                                                                                    | What                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Permission`, `PERMISSIONS`                                                                               | `resource:verb` constants; `PERMISSIONS` is the full list (seeds `identity.permission`)                                                                       |
| `Role`, `SYSTEM_ROLES`                                                                                    | the five system role keys                                                                                                                                     |
| `ROLE_PERMISSIONS`                                                                                        | role → permission keys; the seed treats this as the source of truth for system roles                                                                          |
| `Actor`, `Grant`, `ScopeType`, `AccountPlane`                                                             | shape the Nest `AuthGuard` builds from a verified access token                                                                                                |
| `can(actor, permission, ctx)` / `assertCan(...)` / `AuthorizationError`                                   | deny-by-default check: grant must carry the permission **and** its scope must cover `ctx` (`global` any / `self` owner-or-none / `seller` matching `scopeId`) |
| `ResourceContext`                                                                                         | `{ sellerId?, ownerAccountId? }` — the object the scope check runs against                                                                                    |
| `hashPassword`, `verifyPassword`, `needsRehash`, `ARGON2_OPTIONS`, `ARGON2_PARAMS`, `DUMMY_PASSWORD_HASH` | argon2id (via `@node-rs/argon2`), OWASP-baseline cost params                                                                                                  |

The Nest side (`apps/api/src/auth/`) wires this into `AuthGuard` +
`@RequirePermission` + `PermissionGuard`; the `Actor` is rebuilt from the DB on
every request, so a grant change takes effect immediately.

## Test

```bash
pnpm --filter @shopnetic/auth test   # vitest — password, role-map, can() unit + property
```
