# 15 — Realtime & Notifications

Status: DRAFT
Related: `02-architecture.md`, `12-cart-checkout-orders.md`, `01-tech-stack.md`

Two related but distinct systems:

- **Realtime Gateway** — pushes *live UI updates* to currently-connected clients
  over WebSocket. Ephemeral. If missed, it doesn't matter (page refresh recovers).
- **Notification Service** — *durable, multi-channel* messages (in-app inbox,
  email, push, SMS) with preferences, templates, delivery tracking. If missed,
  it matters.

## 1. Realtime Gateway

### Tech
Socket.IO service (its own deployable — stateful connections, independent
scaling), **Redis adapter** for cross-pod fan-out, sticky sessions / consistent
hashing at the LB, JWT auth on connect (+ periodic re-auth), namespaces + rooms.

### Namespaces & rooms

| Namespace | Rooms | Events pushed |
|-----------|-------|---------------|
| `/buyer` | `user:{id}`, `order:{id}` | order/sub-order status change, shipment tracking event, refund update, price-drop on wishlist item, new message, notification-inbox badge |
| `/seller` | `seller:{id}` | new sub-order, cancellation, return request, payout sent, low-stock alert, new message, dispute update, health-score change |
| `/admin` | `staff:{id}`, `queue:{name}` | new report / moderation item, dispute assigned, queue depth, system alerts |
| `/catalog` (optional, public) | `product:{id}` | live stock "only N left", price change on an open PDP, buy-box change |

### How events reach clients

```
domain event (RabbitMQ)  ─►  Realtime Gateway consumer  ─►  emit to room  ─►  connected sockets
```

- Gateway is a **pure projection** of domain events → socket emits. It holds no
  business logic and no source-of-truth state.
- Client reconciles on `connect`/`reconnect` by refetching the affected resource
  (don't trust the socket payload as authoritative for money/stock — it's a
  "go refresh this" hint + optimistic display).
- Backpressure: if a client is slow/disconnected, drop realtime events for it
  (durable path is the Notification inbox).

### Use cases beyond notifications
Live order tracking map/timeline, seller order dashboard auto-updating, admin
moderation queue live count, "someone is typing" + read receipts in messaging,
live inventory countdown on hot PDPs, flash-sale stock ticker.

### Scaling & ops
Connection count + memory per pod metrics, HPA on connections, max connections
per pod, graceful drain on deploy (clients auto-reconnect elsewhere), heartbeat/
ping timeout tuned, per-user connection cap (anti-abuse), auth failure rate alert.
Fallback: if gateway is down, UI works fine with manual refresh + polling of a
lightweight `/updates?since=` endpoint.

## 2. Notification Service (its own deployable — spiky load, slow 3rd parties)

### Pipeline

```
domain event / explicit command
        │
        ▼
  Notification Service
   1. resolve recipients (fan-out: e.g. "order.placed" -> buyer + each seller)
   2. load per-recipient preferences (event_key × channel on/off, quiet hours, locale)
   3. dedupe / rate-limit / digest (don't send 20 "low stock" mails in an hour)
   4. render template (channel + locale) with data
   5. enqueue per-channel delivery jobs (BullMQ)
        ├─ in-app  -> write `notification` row, emit realtime badge
        ├─ email   -> provider (Resend/SES/Postmark)
        ├─ push    -> web push / FCM / APNs
        └─ sms     -> provider (Twilio/regional) [sparingly: OTP, delivery]
   6. record `delivery` status; handle bounces/complaints; retry w/ backoff; DLQ
```

### Principles
- **Every notification type is a registered event** with: key, default channels,
  default on/off, category (transactional vs marketing), template set, required
  data schema. New feature ⇒ register its notification types (checklist item).
- **Transactional vs marketing** strictly separated: marketing respects
  unsubscribe + consent; transactional (order updates, security) always sent
  (still preference-tunable within limits).
- **Idempotency**: `(event_id, recipient, channel)` unique → no duplicate sends
  on event redelivery.
- **Templates**: versioned, stored in DB, editable by Admin (CMS), MJML/
  Handlebars, previewable, test-send, locale fallback chain.
- **Quiet hours / timezone**: defer non-urgent notifications; batch into digests.
- **Localization**: render in recipient's locale; `Intl` formatting; RTL-safe.

### Channels

| Channel | Use | Notes |
|---------|-----|-------|
| In-app inbox | Everything | Durable, `notification` table, read/unread, deep links, realtime badge |
| Email | Order lifecycle, security, receipts, digests, marketing | DKIM/SPF/DMARC, dedicated sending domain, bounce/complaint webhooks, suppression list |
| Web push / mobile push | Order shipped/delivered, message, price drop | Opt-in, token lifecycle, silent-fail if revoked |
| SMS | OTP, delivery notifications only (cost) | Regional provider, opt-in, STOP handling |

### Preferences model
`notification_pref(account_id, event_key, channel, enabled)`; UI grouped by
category; sensible defaults seeded; "turn off all marketing" master switch;
per-channel verified contact required (verified email, confirmed push token).

### Reliability & abuse
Retry with exponential backoff + jitter; DLQ + alert on depth; provider
failover (secondary email provider); rate-limit per recipient per event;
circuit breaker on provider outage (queue, don't drop); monitor delivery rate,
bounce rate, complaint rate, time-to-deliver.

## 3. Notification catalog (starter — expand per feature)

| Event key | Recipients | Default channels |
|-----------|-----------|------------------|
| `auth.otp` / `auth.password_reset` / `auth.new_device` | account | email/sms (otp), email |
| `order.placed` / `order.payment_confirmed` | buyer | in-app, email |
| `suborder.confirmed/packed/shipped/out_for_delivery/delivered` | buyer | in-app, push, email(shipped+delivered) |
| `suborder.cancelled` / `refund.issued` | buyer | in-app, email |
| `return.requested/approved/denied/completed` | buyer + seller | in-app, email |
| `suborder.new` | seller | in-app, push, email |
| `payout.sent` / `payout.failed` | seller | in-app, email |
| `inventory.low_stock` | seller | in-app (digest), email (digest) |
| `listing.moderation_result` | seller | in-app, email |
| `seller.health_threshold` / `seller.suspended` | seller | in-app, email |
| `message.new` | counterparty | in-app, push, email (if unread after N min) |
| `dispute.opened/updated/resolved` | involved parties | in-app, email |
| `report.new` / `queue.sla_breach` | staff | in-app, realtime, email (breach) |
| `price_drop` / `back_in_stock` | subscribed buyers | in-app, push, email (opt-in, marketing rules) |
| `campaign.*` | buyers | email/push (marketing consent only) |

## 4. Testing focus
Fan-out correctness (multi-seller order → right sellers), preference honored,
dedupe on redelivery, digest batching, template render with missing data,
provider failure → retry → DLQ, quiet-hours deferral, unsubscribe respected,
realtime reconnect reconciliation.
