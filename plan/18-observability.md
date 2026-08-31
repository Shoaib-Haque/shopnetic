# 18 — Observability

Status: DRAFT
Related: `17-infrastructure-devops.md`, `20-non-functional-requirements.md`

"A feature isn't done until you can observe and moderate it." Every service ships
with logs, metrics, traces, a dashboard, SLOs, and alerts.

## 1. The three signals + events

| Signal | Tool (self-host option / SaaS) | Use |
|--------|-------------------------------|-----|
| **Traces** | OpenTelemetry SDK → Tempo / Jaeger (or Datadog/Honeycomb) | Follow one request/saga across services |
| **Metrics** | OTel / Prometheus client → Prometheus/Mimir (or Grafana Cloud) | Rates, latencies, saturation, business KPIs |
| **Logs** | Pino (JSON) → Loki (or ELK/Datadog) | Debug detail, audit-adjacent context |
| **Errors** | Sentry (FE + BE) | Grouped exceptions, release health, source maps |
| **Product analytics** | Event stream → warehouse (later ClickHouse/BigQuery) | Funnels, cohorts, experiments |
| **Uptime / synthetics** | Grafana Synthetic / Checkly / Pingdom | Black-box "is checkout up" from outside |
| **RUM** | web-vitals + Sentry/RUM | Field Core Web Vitals, JS errors, slow routes |

**OpenTelemetry is the standard** — one instrumentation, swappable backends.

## 2. Correlation

- Generate/accept `X-Correlation-Id` at the edge; propagate via HTTP headers and
  message headers (RabbitMQ) through every hop, job, and saga step.
- Trace context (W3C `traceparent`) propagated the same way.
- Every log line includes: `timestamp, level, service, env, version,
  correlationId, traceId, spanId, userId?, sellerId?, route, msg`.
- A support agent can paste an order id / request id and get the full trace + logs.

## 3. Logging rules

- **Structured JSON only**, one event per line, via a shared `@shopnetic/observability` logger.
- Levels: `error` (needs attention), `warn` (unexpected, handled), `info`
  (state changes, requests), `debug` (dev/troubleshoot, off in prod by default).
- **Never log**: passwords, tokens, card data, full PAN, CVV, full addresses,
  KYC document contents, raw request bodies of auth/payment endpoints. Redaction
  allow-list by default (deny unknown fields).
- Log the decision, not the essay: "coupon rejected: min_spend not met
  (cartTotal=..., min=...)".
- Sampling: `info` request logs sampled at high volume; always keep `error`/`warn`
  and anything on a money/saga path.
- Retention: hot 14–30d searchable, cold/archive 90–365d (compliance-driven);
  audit logs far longer (see `16`).

## 4. Metrics — what every service exports

**RED** (per endpoint/consumer): Request rate, Error rate, Duration (histogram →
p50/p95/p99).
**USE** (per resource): Utilization, Saturation, Errors — CPU, memory, event-loop
lag, GC, DB pool in-use/wait, Redis latency, queue depth/age, socket count.
**Dependencies**: outbound call rate/latency/error per downstream + circuit-
breaker state.

## 5. Business / domain metrics (first-class, on dashboards)

- Orders placed / min, checkout start→confirm conversion, checkout failure
  reasons breakdown, payment success rate, add-to-cart rate.
- GMV, AOV, refund rate, dispute rate, cancellation rate.
- Search: queries/min, zero-result rate, p95 latency, click-through.
- Catalog: active offers, indexing lag (event→searchable), moderation queue depth
  + age.
- Sellers: onboarding funnel, time-to-approve, active sellers.
- Payouts: run success rate, failed payouts, reconciliation variance.
- Notifications: send rate, delivery rate, bounce/complaint rate, time-to-deliver.
- Realtime: connected clients, emit lag, reconnect rate.

These catch "revenue is dropping" faster than CPU graphs do.

## 6. Tracing specifics

- Instrument: HTTP server/client, Prisma (DB spans with statement summary, no
  values), Redis, RabbitMQ publish/consume, BullMQ jobs, outbound provider calls.
- **Saga tracing**: each checkout/refund/offboarding saga is one trace with a
  span per step and compensation; tag `saga.name`, `saga.step`, `saga.outcome`.
- Tail-based sampling: keep 100% of errors/slow/saga traces, sample the rest
  (e.g. 5–10%).
- Span attributes for `order.id`, `seller.id`, `payment.intent` (ids, never PII).

## 7. Dashboards (Grafana)

- **Golden overview**: traffic, error rate, p95 latency, saturation per service;
  SLO burn-down.
- **Checkout/Orders**: funnel, saga success/compensation counts, oversell
  attempts, payment provider latency/errors.
- **Payments/Ledger**: capture/refund/payout rates, reconciliation variance,
  webhook backlog.
- **Search**: latency, zero-results, indexing lag, engine health.
- **Realtime**: connections, fan-out lag, reconnects.
- **Per-service**: RED/USE + dependency panel + recent deploys overlay.
- **Business**: GMV, orders, conversion, refunds — visible to product/ops.
- Deploy markers overlaid on every dashboard.

## 8. SLOs & error budgets

| Service / journey | SLI | SLO (starting) |
|-------------------|-----|----------------|
| Storefront public pages | availability (2xx/3xx) | 99.9% / 30d |
| Storefront TTFB (SSR) | p95 | ≤ 600ms |
| Product API | availability | 99.9% |
| Search query | success & p95 | 99.5%, ≤ 300ms |
| Add-to-cart / cart API | availability | 99.9% |
| **Checkout confirm** | success (excl. user/payment decline) | 99.95% |
| Payment webhook processing | processed < 1 min | 99.9% |
| Payout run | completes on schedule | 99% of runs |
| Realtime delivery | event→client < 2s | 99% |

- Error budget policy: burn > 2%/day → freeze risky launches, prioritize
  reliability work.
- Multi-window multi-burn-rate alerts (fast + slow burn).

## 9. Alerting

- **Page** (wake someone): checkout success < SLO, payment provider down,
  DB primary down, error budget fast-burn, ledger reconciliation variance >
  threshold, queue age > X min on payments/orders, prod deploy auto-rollback.
- **Ticket** (next business day): elevated 4xx, slow-burn SLO, rising refund/
  dispute rate, indexing lag, cert expiry < 14d, cost anomaly.
- **FYI** (Slack): deploys, canary progress, nightly test results, weekly SLO report.
- Every alert links to: dashboard, runbook section, recent deploys, owning team.
- No alert without an owner and an action. Kill noisy alerts fast (alert on
  symptoms/SLOs, not every transient blip).
- On-call rotation, escalation policy, incident channel auto-creation, blameless
  post-mortems with tracked action items.

## 10. Health & readiness

- `/healthz` (process alive), `/readyz` (deps reachable: DB, Redis, broker as
  relevant — with timeouts, don't cascade).
- Startup probe for slow boots (migrations check, cache warm).
- Synthetic journey every minute from outside: home → PDP → add to cart →
  begin checkout (test account, no real payment) → alert on failure.

## 11. Cost observability
Per-service resource cost (labels), CDN egress, provider fees, search cluster,
data egress; monthly review; anomaly alerts.
