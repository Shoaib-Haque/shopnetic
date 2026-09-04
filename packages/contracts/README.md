# @shopnetic/contracts

**Source of truth** for API request/response shapes and shared domain types.
Zod schemas here are used by the frontend (form validation) _and_ the server
(boundary validation) so they can never drift — see `plan/CODING-RULES.md` section P1,
`plan/08-api-design.md` section 9.

Later: OpenAPI generation + a generated typed HTTP client.

STUB — currently just the HTTP envelope, error codes, and the health shape.
