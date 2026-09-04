# 20 — Non-Functional Requirements

Status: DRAFT
Related: `18-observability.md`, `17-infrastructure-devops.md`, `14-caching-strategy.md`

Numbers here are **starting targets** to design against; ratify during review and
re-baseline after the first load test with real infra.

## 1. Performance

| Area | Target |
|------|--------|
| Storefront LCP (mobile p75, field) | ≤ 2.5s |
| Storefront INP (p75) | ≤ 200ms |
| Storefront CLS | ≤ 0.1 |
| SSR TTFB (p95) | ≤ 600ms |
| Public catalog API (p95, cache hit) | ≤ 50ms |
| Public catalog API (p95, cache miss) | ≤ 300ms |
| Search query (p95) | ≤ 300ms |
| Add-to-cart (p95) | ≤ 200ms |
| Checkout confirm (p95, excl. gateway redirect) | ≤ 1.5s |
| Admin/seller data grid load (p95) | ≤ 1s |
| Realtime event → client (p95) | ≤ 2s |
| Search index freshness (catalog write → searchable, p95) | ≤ 30s |
| Notification send latency (event → provider handoff, p95) | ≤ 30s |

## 2. Scalability targets (design envelope — v1 → year 1)

| Dimension | Launch | Year-1 design ceiling |
|-----------|--------|-----------------------|
| Catalog (offers) | 100k | 5M |
| Products (base) | 50k | 1M |
| Sellers | 500 | 20k |
| Registered buyers | 50k | 3M |
| Peak concurrent visitors | 2k | 50k |
| Orders/day | 1k | 100k |
| Peak orders/min (flash sale) | 100 | 3k |
| Search QPS (peak) | 50 | 2k |
| Realtime concurrent connections | 3k | 150k |

Everything must scale **horizontally**: stateless services behind HPA; Postgres
scales via read replicas + connection pooling + (later) per-context DB split +
(last resort) partitioning/sharding on high-volume tables (`order`,
`ledger_entry`, `audit_event`, `tracking_event`). No design decision may assume a
single vertical box.

## 3. Availability & reliability

| Journey | Availability target |
|---------|---------------------|
| Storefront browse/search | 99.9% (≈ 43 min/month) |
| Checkout + payments | 99.95% |
| Seller order management | 99.9% |
| Admin back office | 99.5% |
| Notifications (eventual) | 99.9% delivered < 5 min |

- **Graceful degradation** ladder: search down → category browse from cache;
  recommendations down → hide the row; realtime down → polling; notifications
  provider down → queue; one seller's service data unavailable → show the rest of
  the order.
- **No single point of failure** for checkout: multi-AZ DB with automatic
  failover, Redis replica, broker cluster, ≥2 replicas per critical service,
  multi-AZ node pools.
- Circuit breakers + timeouts + bounded retries (with jitter) on every cross-
  service and provider call. Never an unbounded retry.
- Idempotency + outbox/inbox so retries and redeliveries are safe.

## 4. Disaster recovery

| Metric | Target |
|--------|--------|
| RPO (max data loss) | ≤ 5 min (Postgres PITR / WAL streaming) |
| RTO (time to restore service) | ≤ 1 hour for core commerce |
| Backup retention | Postgres PITR 30d; daily snapshots 90d; object storage versioned + cross-region |
| Restore drill | Monthly, documented, timed |
| Region failure | Documented manual failover to secondary region; target RTO ≤ 4h (revisit if we go active-active) |

Search index and caches are **rebuildable** (not backed up as source of truth,
but snapshotted for faster recovery). Ledger + orders + identity are the
irreplaceable stores — strongest backup guarantees.

## 5. Data retention & compliance

| Data | Retention |
|------|-----------|
| Orders, invoices, ledger, payouts, tax records | Legal minimum (often 7–10y); never hard-deleted, PII anonymized on erasure request |
| Audit log (staff/privileged actions) | ≥ 3y (or per policy), immutable |
| Auth/security logs | 1y |
| Application `info` logs | 14–30d hot, 90–365d cold |
| Traces | 7–30d (errors/saga longer) |
| Carts (guest) | 30d |
| Search query logs (sampled, de-identified) | 90d |
| Marketing consent records | Life of account + legal tail |
| KYC document references | Per financial regulation; docs in provider/restricted store |

- GDPR/CCPA: data export + erasure runbooks; erasure = anonymize PII, retain
  transactional records; propagate deletion to subprocessors.
- PCI DSS SAQ-A posture (no card data on our systems).
- Consent + cookie management; DPAs with all subprocessors.

## 6. Security NFRs (see `16` for detail)

- MFA available to all, mandatory for staff + sellers-before-payout.
- All secrets in a secret manager; rotation ≤ 90d; no long-lived cloud keys.
- Encryption in transit (TLS 1.2+) and at rest everywhere.
- Pen test before launch + annually; bug bounty ongoing.
- Patch SLA: Critical CVE ≤ 48h, High ≤ 7d, Medium ≤ 30d.
- Audit trail on 100% of privileged mutations.

## 7. Accessibility & UX

- WCAG 2.2 AA across storefront, seller, admin.
- Keyboard-complete for every core flow; screen-reader tested on checkout.
- Works on last 2 versions of Chrome/Firefox/Safari/Edge + iOS Safari + Android
  Chrome; functional (degraded) without JS for primary content on indexable pages.
- Storefront usable on 3G / low-end mobile (budgets in `09` section 7).

## 8. Internationalization readiness

- No hard-coded user-facing strings; all via i18n layer from day one.
- Money as minor units + currency code everywhere; no float arithmetic on money;
  rounding rules centralized.
- UTC storage, localized display; timezone-aware scheduling (payouts, quiet hours).
- Schema carries `locale`/`currency`/`country` where relevant even if single-valued now.
- RTL-safe CSS (logical properties).

## 9. Maintainability / operability

- Deploy frequency: ≥ daily capability; lead time (commit→prod) < 1 day.
- Change failure rate < 15%; MTTR < 1h.
- Every service: health/readiness endpoints, dashboard, SLOs, alerts, runbook,
  owner.
- Test coverage floors per `19` section 6; 100% on money-critical modules.
- Infra 100% in code (Terraform + GitOps); no click-ops in prod.
- Documentation: this `plan/` kept current; ADRs for decisions; per-service README.

## 10. Cost guardrails

- Per-order infra cost tracked; target trend downward as volume grows.
- Budget alerts at 70/90/100% of monthly forecast.
- Autoscale floors kept lean; workers scale on queue depth; spot for stateless
  non-critical + CI.
- Quarterly cost review with per-service attribution.

## 11. Legal / operational

- Terms, privacy policy, seller agreement, returns policy, acceptable-use —
  versioned, forced re-accept on material change.
- Marketplace facilitator tax obligations assessed per launch jurisdiction (→ `22`).
- Age-restricted / regulated categories: gating rules configurable.
- Sanctions / restricted-party screening on sellers and payout destinations.
