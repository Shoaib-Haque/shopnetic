# @shopnetic/auth

RBAC primitives shared by every service: permission constants, the `Actor` /
`Grant` types, and the `can(actor, permission, ctx)` authorization entry point.

See `plan/03-users-and-rbac.md` and `plan/16-security.md`.

STUB — `can()` throws `NOT_IMPLEMENTED`. Token verification, the Nest guard, and
the real deny-by-default check land with Identity & Access (Phase 0).
