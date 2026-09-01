# @shopnetic/auth

RBAC primitives shared by every service, plus password hashing.

See `plan/03-users-and-rbac.md` and `plan/16-security.md`.

## Exports

| Symbol                                                                             | What                                                                                    |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `Permission`, `PERMISSIONS`                                                        | `resource:verb` constants; `PERMISSIONS` is the full list (seeds `identity.permission`) |
| `Role`, `SYSTEM_ROLES`                                                             | the five system role keys                                                               |
| `ROLE_PERMISSIONS`                                                                 | role → permission keys; the seed treats this as the source of truth for system roles    |
| `Actor`, `Grant`, `ScopeType`, `AccountPlane`                                      | the shape the Nest guard will build from a verified access token                        |
| `can(actor, permission, ctx)`                                                      | **stub** — throws; the deny-by-default check + guard land in the RBAC slice             |
| `hashPassword`, `verifyPassword`, `needsRehash`, `ARGON2_OPTIONS`, `ARGON2_PARAMS` | argon2id (via `@node-rs/argon2`), OWASP-baseline cost params                            |

## Test

```bash
pnpm --filter @shopnetic/auth test   # vitest — password + role-map invariants
```
