# 22 — Risks & Open Questions

Status: DRAFT

Two lists: **decisions we still owe** (block certain work if unanswered) and a
**risk register**. Keep an owner + a "needed-by" milestone on each open question.
When answered, record it as an ADR and delete/collapse the entry here.

## A. Open decisions

| # | Question | Options / lean | Needed by | Owner |
|---|----------|----------------|-----------|-------|
| Q1 | **Launch country / region** (drives payment provider, tax rules, KYC, currency, shipping carriers, COD availability, legal entity) | Must be answered first — everything downstream depends on it | Phase 0 | — |
| Q2 | **Payment provider** | Marketplace-capable (Stripe Connect / Adyen for Platforms / regional). Fallback: plain gateway + self-run escrow + bank payout API. Depends on Q1. | Phase 2 start | — |
| Q3 | **Payment capture timing** | Lean: authorize at placement, capture-on-ship per sub-order, escrow from capture. Alt: capture-now into escrow. Depends on provider caps. See `12` section 7. | Phase 2 start | — |
| Q4 | **Guest checkout** | Lean: require account but 1-step signup from cart. Alt: true guest with post-purchase account claim. | Phase 2 start | — |
| Q5 | **Search engine for launch** | Lean: Meilisearch (fast to ship) behind a `SearchService` interface. Alt: OpenSearch now if team comfortable + scale/relevance needs it. See `11`. | Phase 1 | — |
| Q6 | **Search index granularity** | Lean: per-variant document (enables size/color facets + price ranges). Alt: per-product. | Phase 1 | — |
| Q7 | **Message broker** | Lean: RabbitMQ. Alt: NATS (lighter ops). Kafka only if replay/throughput later demands. In-process events acceptable until first extraction. | Phase 1 | — |
| Q8 | **BFF vs API Gateway first** | Lean: Next.js route handlers as BFF for storefront + a Nest BFF for admin/seller; add Kong/Traefik gateway when service count grows. | Phase 1 | — |
| Q9 | **Cloud provider** | AWS / GCP / Azure — pick based on team familiarity + managed service fit (esp. marketplace payments, managed search, managed broker). | Phase 0 | — |
| Q10 | **Self-hosted observability (Grafana stack) vs SaaS (Datadog/Grafana Cloud/Honeycomb)** | Lean: SaaS early (less ops), revisit on cost. | Phase 0 | — |
| Q11 | **Tax computation**: build simple single-jurisdiction rules vs integrate a tax service (TaxJar/Avalara) | Lean: simple rules for launch region, abstract behind a `TaxService`. | Phase 2 | — |
| Q12 | **Cart quantity merge on login**: sum vs max | Lean: sum, capped at `max_qty`. | Phase 2 | — |
| Q13 | **Reviews**: allow reviews without purchase (unverified, labeled) or verified-only | Lean: verified-purchase only at launch. | Phase 2 | — |
| Q14 | **New base-product creation**: seller-proposes + admin-approves (quality) vs seller-creates-directly (speed) | Lean: propose + approve, with fast-track for trusted sellers later. | Phase 1 | — |
| Q15 | **COD** support at launch? | Depends on Q1 region norms. Adds reconciliation + fraud complexity. | Phase 2 | — |
| Q16 | **Escrow hold / review window length**, payout schedule (e.g. weekly T+2 after delivery), new-seller reserve % | Config values; need finance/ops input. | Phase 2 | — |
| Q17 | **Commission model**: flat % vs per-category vs tiered by seller volume | Lean: per-category default + per-seller override, snapshot on order. | Phase 2 | — |
| Q18 | **Domain / brand name** confirmed as "Shopnetic"? Affects domains, email sending domain, trademarks. | Phase 0 | — |
| Q19 | **Mobile**: responsive web only for the foreseeable future, or native apps on the roadmap? (affects API/versioning investment) | Lean: responsive/PWA-quality web first. | Phase 3 | — |
| Q20 | **Team size & shape** (drives monolith-vs-services aggressiveness, how much to build vs buy) | — | Phase 0 | — |
| Q21 | **GraphQL** ever? (ADR-0002 says REST now) — revisit if FE needs highly variable graphs / a public partner API. | Phase 3 | — |
| Q22 | **Content moderation**: build heuristics vs integrate a moderation API for images/text | Lean: 3rd-party API for images + keyword/heuristics for text, human queue behind both. | Phase 2–3 | — |
| Q23 | **Multi-currency/locale timing** — confirmed Phase 4? Any launch requirement for >1 locale? | Phase 4 | — |
| Q24 | **Legal entity & compliance**: who is merchant of record (seller vs platform), marketplace facilitator tax obligations, sanctions screening vendor | Phase 2 | — |
| Q25 | **i18n content storage** (`24` section 5): JSONB localized columns (Approach A) vs `*_translation` tables (Approach B), per entity | Lean: JSONB now (single locale), switch high-volume entities to tables when multi-locale lands | Phase 1 | — |
| Q26 | **`open` option values** (esp. Color, `26` section 9): free text + normalization dictionary vs a curated master palette sellers map onto | Lean: curated master palette + alias, keeps facets clean | Phase 1 | — |
| Q27 | **Variant count cap per product** (`26` section 9) | Lean: warn at 100, block at 500 combinations; tune | Phase 1 | — |
| Q28 | **Guest checkout account requirement** already Q4 — confirm interaction with cart-merge + `29` alerts | see Q4 | Phase 2 | — |
| Q29 | **Admin base-path obfuscation** (`23` section 3): rotate `ADMIN_BASE_PATH` per environment only, or also periodically in prod? | Lean: per-env + on suspected exposure; not on a timer | Phase 0 | — |
| Q30 | **Analytics warehouse** timing (`30` section 8): how long can Postgres summary tables serve reporting before ClickHouse/BigQuery is needed? | Revisit when daily rollup runtime or dashboard latency degrades | Phase 3–4 | — |

## B. Risk register

Likelihood (L) / Impact (I): 1–5. Score = L×I. Mitigations are the plan.

| ID | Risk | L | I | Score | Mitigation | Owner |
|----|------|---|---|-------|-----------|-------|
| R1 | **Over-engineering**: building 12 microservices before product-market fit; team drowns in distributed-systems overhead | 4 | 4 | 16 | Modular monolith first (ADR-0003); hard module boundaries; extract only on trigger; `02` section 1 | — |
| R2 | **Money bugs**: oversell, double charge, wrong refund, unbalanced ledger, lost webhook | 3 | 5 | 15 | Double-entry ledger; saga + compensation; idempotency keys; outbox/inbox; atomic stock decrement; property tests + mutation tests on money modules (`19` section 3); reconciliation job (`13` section 8) | — |
| R3 | **Payment provider limitations** discovered late (no marketplace split, region gaps, capture rules) | 3 | 5 | 15 | `PaymentProvider` abstraction; spike/POC the chosen provider in Phase 0–1 before committing checkout design; keep self-escrow fallback path documented | — |
| R4 | **SEO underperforms** (faceted-nav crawl traps, thin pages, CWV fails, dup content) | 3 | 4 | 12 | `10` rulebook; CI guards (noindex on money pages, JSON-LD valid, sitemap builds); Lighthouse-CI gate; Search Console monitoring; curated facet pages only | — |
| R5 | **Seller payout fraud** (change bank → cash out → vanish) | 3 | 4 | 12 | KYC; bank-change cool-off + re-verify; payout delay T+N after delivery; rolling reserve for new sellers; velocity + dispute monitoring; payout holds (`13` section 6, `16` section 6) | — |
| R6 | **Flash-sale / launch traffic spike** melts DB or causes oversell | 3 | 4 | 12 | Load + spike tests (`19` section 7); cache stampede protection (`14` section 6); atomic decrement; autoscaling with tested targets; queue-based smoothing; read replicas | — |
| R7 | **Catalog quality collapse** (duplicate/counterfeit/spam listings) hurts trust + SEO | 3 | 4 | 12 | Product/Offer split; moderation queue; duplicate detection; image/text auto-moderation; report flow; seller trust gating (`11` section 1, `16` section 6) | — |
| R8 | **Scope creep** delays MVP indefinitely | 4 | 3 | 12 | Explicit MVP cut line (`21`); out-of-scope list (`00` section 5); phase exit gates; ADRs to force decisions | — |
| R9 | **Distributed data drift** (search index, read-model copies, balances out of sync) | 3 | 3 | 9 | Event versioning + idempotent consumers; full-reindex + repair jobs; reconciliation; ledger is single source for balances | — |
| R10 | **Review/rating manipulation** damages trust | 3 | 3 | 9 | Verified-purchase only; velocity + device/IP clustering; moderation queue; graph analysis later (`16` section 6) | — |
| R11 | **PII / data breach** (buyer addresses, KYC, tokens) | 2 | 5 | 10 | Encryption at rest + field-level for sensitive; data minimization (sellers see only their sub-order ship-to); secret manager; SAST/DAST; pen test; least-privilege IAM; log redaction (`16` section 7) | — |
| R12 | **Account takeover** (buyer or seller) | 3 | 4 | 12 | Refresh rotation + reuse detection; MFA (mandatory for staff/sellers); new-device alerts; step-up on payout/bank/email change; breached-password check (`16` section 1) | — |
| R13 | **Vendor lock-in** (payments, search, cloud managed services) | 3 | 3 | 9 | Abstractions (`PaymentProvider`, `SearchService`, `TaxService`); IaC; standard protocols (OTel, S3 API, SQL); document exit cost per vendor | — |
| R14 | **Cost overrun** (search cluster, CDN egress, provider fees, over-provisioned k8s) | 3 | 3 | 9 | Cost observability + attribution (`18` section 11); lean autoscale floors; spot for non-critical; monthly review; per-order cost KPI | — |
| R15 | **Migration causes downtime / data loss** as schema evolves | 2 | 4 | 8 | Expand/contract migrations; rehearse on prod-sized clone; forward-only; PITR backups; never breaking migration + dependent code in one deploy (`17` section 6) | — |
| R16 | **Regulatory / tax mistakes** (marketplace facilitator, VAT/GST, sanctions) | 3 | 4 | 12 | Resolve Q1/Q11/Q24 early; abstract tax; legal review before launch; sanctions screening vendor; per-jurisdiction config | — |
| R17 | **Realtime layer instability** (connection storms, memory, deploy drops) | 2 | 3 | 6 | Separate deployable; Redis adapter; connection caps; graceful drain; polling fallback; load test connections (`15` section 1) | — |
| R18 | **Key-person / knowledge silos** given breadth of system | 3 | 3 | 9 | This `plan/` + ADRs + per-service runbooks; pairing on money/auth/RBAC; mandatory review on critical areas | — |
| R19 | **Notification spam / poor deliverability** harms brand + engagement | 2 | 3 | 6 | Preferences + digests + quiet hours; transactional/marketing split; SPF/DKIM/DMARC + dedicated domain; bounce/complaint handling; provider failover (`15` section 2) | — |
| R20 | **Test suite rot / flakiness** erodes CI trust, slows delivery | 3 | 3 | 9 | Right-layer testing; Testcontainers for realism; quarantine flaky with owner+deadline; coverage floors as floors not goals (`19`) | — |

## C. Assumptions to validate

- Sellers self-fulfil (no platform logistics) at launch.
- Single currency, single locale, single primary region at launch.
- Physical goods only (no digital/downloadable, no subscriptions) at launch.
- One legal/tax jurisdiction for platform operations at launch.
- Team is comfortable with TypeScript across the stack (Next + Nest).
- Buyers accept creating an account to purchase (pending Q4).
- A marketplace-capable payment provider is available in the launch region (pending Q1/Q2).
