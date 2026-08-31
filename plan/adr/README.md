# Architecture Decision Records

One file per significant, hard-to-reverse decision. Use `0000-template.md`.
Number sequentially. Never edit an Accepted ADR's decision — write a new ADR that
supersedes it and set the old one's status to `Superseded by ADR-XXXX`.

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-monorepo.md) | Monorepo with pnpm workspaces + Turborepo | Accepted |
| [0002](0002-rest-over-graphql.md) | REST + BFF over GraphQL (for now) | Accepted (revisit) |
| [0003](0003-modular-monolith-first.md) | Modular monolith first, extract services on trigger | Accepted |

## Candidate ADRs still to write (see `../22-risks-and-open-questions.md`)

- Launch region & legal entity (Q1)
- Payment provider selection (Q2) + capture timing (Q3)
- Search engine selection (Q5) + index granularity (Q6)
- Message broker selection (Q7)
- Cloud provider (Q9)
- Observability: self-hosted vs SaaS (Q10)
- Tax computation approach (Q11)
- Commission model (Q17)
- Auth token design (once implemented — lock the details from `16`)
- Media/image pipeline
