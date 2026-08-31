# 08 — API Design

Status: DRAFT
Related: `adr/0002-rest-over-graphql.md`, `01-tech-stack.md`, `16-security.md`

## 1. Surfaces

| Surface | Consumers | Style |
|---------|-----------|-------|
| **Storefront API** (`/api/v1/...` via BFF) | Next.js storefront (RSC + client) | REST/JSON, aggressively cacheable for public reads |
| **Seller API** (`/seller/v1/...`) | Seller panel | REST/JSON, auth required, scope `seller:{id}` |
| **Admin API** (`/admin/v1/...`) | Back office | REST/JSON, staff auth, permission-gated |
| **Internal service APIs** | Service-to-service | REST or Nest RPC; not internet-exposed |
| **Webhooks in** | Payment/shipping providers | Signed, idempotent |
| **Webhooks out** (later) | Seller integrations | Signed, retried |
| **Realtime** | Browser | Socket.IO namespaces (`15`) |

The **BFF** composes multiple service calls into one page-shaped response so the
browser makes few round-trips and services stay small/uncoupled.

## 2. Conventions

- **Base**: `https://api.shopnetic.com/{surface}/v{major}`.
- **Versioning**: URL major version; additive changes don't bump; breaking
  changes = new major + deprecation window + `Sunset` header.
- **Format**: JSON only. `camelCase` keys. Timestamps ISO-8601 UTC. Money as
  `{ "amount": 1299, "currency": "USD" }` (minor units).
- **IDs**: string UUIDv7 (`"prod_01H..."` prefixed for readability, optional).
- **Content negotiation**: `Accept: application/json`; reject others with 406.
- **Compression**: gzip/br at the edge.

## 3. Resource patterns

```
GET    /catalog/v1/products?category=slug&facet.brand=acme&sort=price&page[cursor]=...&page[size]=24
GET    /catalog/v1/products/{slug}
GET    /catalog/v1/products/{id}/offers
POST   /cart/v1/items            { offerId, qty }        Idempotency-Key: <uuid>
PATCH  /cart/v1/items/{id}       { qty }
POST   /checkout/v1/sessions     { cartId, addressId }
POST   /checkout/v1/sessions/{id}/confirm   Idempotency-Key: <uuid>
GET    /orders/v1/orders?status=shipped&page[cursor]=...
POST   /orders/v1/sub-orders/{id}/cancel    { reason }
POST   /seller/v1/offers        { variantId, price, stock, ... }
POST   /admin/v1/sellers/{id}/approve       { note }
```

- Collections: **cursor pagination** (`page[cursor]`, `page[size]`, response
  `meta.nextCursor`). Offset only for admin tables with total counts.
- Filtering: `filter[field]=value`; ranges `filter[price][gte]=10`.
- Sorting: `sort=field` / `sort=-field`.
- Sparse fields / expansion: `fields[product]=title,price`, `include=brand,offers`
  — kept minimal; BFF usually decides shape.
- Partial update = `PATCH` with merge semantics; full replace = `PUT`.
- Bulk = `POST /.../batch` returning per-item results (`207`-style body).

## 4. Standard response envelopes

Success (single):
```json
{ "data": { ... }, "meta": { "requestId": "..." } }
```
Success (collection):
```json
{ "data": [ ... ], "meta": { "requestId": "...", "nextCursor": "...", "count": 24 } }
```
Error (RFC 9457 problem+json shape):
```json
{
  "error": {
    "type": "https://errors.shopnetic.com/validation",
    "title": "Validation failed",
    "status": 422,
    "code": "VALIDATION_ERROR",
    "detail": "qty must be >= 1",
    "errors": [{ "field": "qty", "rule": "min", "message": "must be >= 1" }],
    "requestId": "req_...",
    "correlationId": "cor_..."
  }
}
```
- **Machine-readable `code`** (stable enum) drives client handling; `title/detail`
  are human text.
- Never leak stack traces or internal identifiers in prod.

## 5. Status code policy

| Code | Use |
|------|-----|
| 200 / 201 / 204 | OK / created / no content |
| 400 | Malformed request |
| 401 | Missing/invalid auth |
| 403 | Authenticated but not permitted (RBAC) |
| 404 | Not found *or* not visible to this actor (don't confirm existence) |
| 409 | Conflict (optimistic lock, duplicate, state machine violation) |
| 410 | Gone (deprecated version / deleted permanently) |
| 422 | Semantic validation failure |
| 429 | Rate limited (`Retry-After`) |
| 5xx | Our fault — logged, traced, alerted; generic body |

## 6. Idempotency

- Required header `Idempotency-Key` on: cart mutations, checkout confirm,
  payments, refunds, admin bulk/destructive actions, any POST that moves money
  or stock.
- Server stores `(key, route, actor) → response` for 24h; replays return the
  stored response with `Idempotency-Replayed: true`.
- Inbound webhooks deduped by provider event id.

## 7. Auth headers

- `Authorization: Bearer <access-jwt>` for user/staff calls.
- Refresh via `POST /identity/v1/token/refresh` (httpOnly cookie), rotates token.
- Service-to-service: mTLS or short-lived signed service tokens + `X-Service`.
- `X-Correlation-Id` accepted and propagated; generated if absent.

## 8. Rate limiting & quotas

- Tiered: anonymous < authenticated buyer < seller < staff < internal.
- Sensitive endpoints (login, OTP, coupon apply, checkout) get stricter buckets.
- Token-bucket in Redis; `X-RateLimit-*` headers; `429` + `Retry-After`.
- Abuse → progressive backoff + Trust & Safety flag.

## 9. Contracts & docs

- Zod schemas in `@shopnetic/contracts` are the source of truth → generate
  OpenAPI 3.1 → generate typed FE client + published docs.
- **Contract tests** (Pact or schema-based) in CI: BFF vs each service, FE vs BFF.
- Breaking-change detector on OpenAPI diff blocks merge without a version bump.

## 10. Caching semantics (see `14`)

- Public catalog GETs: `Cache-Control: public, s-maxage=60,
  stale-while-revalidate=300` + `ETag`; purged by CDN tag on catalog events.
- Authenticated GETs: `private, no-store`.
- Conditional requests (`If-None-Match`) supported on catalog resources.

## 11. Pagination limits & safety

- `page[size]` max 100 (default 24). Deep pagination beyond cursor horizon → 400
  with "use filters".
- All list endpoints have a hard `LIMIT` and statement timeout.
- N+1 protection: BFF batches (DataLoader-style) per request.

## 12. Deprecation process

Announce → `Deprecation` + `Sunset` headers + changelog → min 90-day window for
external, 30-day internal → remove. Track caller usage via metrics before removal.
