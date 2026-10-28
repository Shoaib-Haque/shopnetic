# 36 — Social, Immersive & Advanced Commerce: Live Shopping, AR/3D & Group Carts

Status: DRAFT  
Related: `04-features-buyer.md`, `05-features-seller.md`, `07-data-model.md`, `12-cart-checkout-orders.md`, `15-realtime-and-notifications.md`, `26-catalog-options-variants-brands.md`

---

## 1. Problem & Scope

Modern e-commerce is evolving beyond static grid-and-detail browsing toward immersive, interactive, and community-driven experiences:
1. **In-Stream Live Shopping**: Real-time video broadcasting by verified merchants featuring live product demonstrations, real-time chat, and pinned "Instant Buy" overlay cards allowing one-tap purchase without pausing or leaving the broadcast stream.
2. **Shoppable Vertical Video Feeds**: Fast-loading vertical video feeds (unboxing clips, styling guides, customer reviews) with synchronized interactive product hotspots and direct add-to-bag triggers.
3. **Immersive 3D & Augmented Reality (AR)**:
   - Interactive 3D Model Viewers (`<model-viewer>` / Three.js) with 360-degree orbital rotation, lighting adjustment, and exploded view modes.
   - AR "View in Your Room" (WebXR / USDZ / GLB) projecting true-scale furniture and home decor into the physical environment via mobile browser cameras.
   - Virtual Try-On for eyewear, hats, cosmetics, and apparel accessories.
4. **Collaborative Group Carts ("Cart Splits")**: Shared shopping sessions where friends, families, or coworkers add items to a shared basket and split payments at checkout across separate cards.
5. **Smart Re-Order Subscriptions**: Automated replenishment hubs for consumable goods (coffee, pet food, vitamins) offering discount incentives and customizable renewal intervals (e.g. every 2, 4, 8 weeks).

---

## 2. Core Architectural Invariants

**[NOTE — see `22` R1]**: the live-shopping stack (video transcoding, WebSocket
broadcast infra) adds substantial new ops burden relative to the project's current
lean Postgres/Redis/BullMQ stack and its stated modular-monolith-first stance. Weigh
against R1 before scheduling, not just against this doc's own phase.

1. **Seamless In-Stream Checkout (Zero Video Interrupt)**:
   - Live stream purchasing utilizes a slide-up checkout modal over the video stream (`z-index: 50`) using pre-saved buyer shipping addresses and payment tokens (1-Click Checkout).
   - Video playback audio/video remains uninterrupted during order placement via background WebSocket order dispatch (`realtime/` gateway).
2. **Standardized 3D Asset Pipeline**:
   - Master 3D models are uploaded as binary `.glb` (glTF 2.0).
   - Serverless background workers automatically convert `.glb` to Apple `.usdz` (for iOS Quick Look AR) and generate preview posters (`.webp`). File size ceiling is strictly enforced (maximum 25MB).
3. **Group Cart Concurrency & Payment Atomicity**:
   - Group carts use distributed Redis locks during item mutations (`group_cart:${id}`).
   - Checkout transition: When the group leader locks the cart for payment, each member is assigned a split payment quota. The master order transitions to `paid` **only when all member authorizations settle** within a 15-minute timebox. If any member fails or abandons, all pre-authorizations are voided.
4. **Subscription Order Generation Engine**:
   - Subscriptions are independent contracts (`subscription_contract`) that trigger automated background fulfillment orders via BullMQ queue schedules (`31-background-jobs-and-queues.md`).
   - Prices follow current catalog rules or contract-locked discounts; stock is pre-allocated 48 hours prior to the scheduled charge.
   - **[NOTE — see `22` Assumptions]**: recurring/subscription billing contradicts the
     "physical goods only, no subscriptions at launch" assumption at face value —
     already correctly scoped to a later phase here, but that assumption should be
     formally updated (or given an explicit post-launch carve-out) once this is
     actually committed to, rather than left silently conflicting.

---

## 3. Data Model (`social` and `immersive` Schemas)

```sql
CREATE SCHEMA IF NOT EXISTS social;

-- Live streaming shopping broadcasts
CREATE TABLE social.live_stream (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id               UUID NOT NULL,                      -- Host merchant
  title                   VARCHAR(128) NOT NULL,
  description             TEXT,
  playback_url            TEXT NOT NULL,                      -- HLS stream URL
  status                  VARCHAR(32) NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'live' | 'ended'
  started_at              TIMESTAMPTZ,
  ended_at                TIMESTAMPTZ,
  viewer_count            INTEGER NOT NULL DEFAULT 0,
  pinned_product_id       UUID,                               -- Active pinned product
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shoppable video clips (feed items)
CREATE TABLE social.shoppable_video (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_account_id      UUID NOT NULL,                      -- Seller or verified influencer
  video_url               TEXT NOT NULL,
  thumbnail_url           TEXT NOT NULL,
  caption                 TEXT,
  duration_seconds        INTEGER NOT NULL,
  status                  VARCHAR(32) NOT NULL DEFAULT 'published',
  views_count             INTEGER NOT NULL DEFAULT 0,
  likes_count             INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hotspot product tags inside shoppable videos
CREATE TABLE social.video_product_tag (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id                UUID NOT NULL REFERENCES social.shoppable_video(id) ON DELETE CASCADE,
  product_id              UUID NOT NULL,
  timestamp_seconds       INTEGER NOT NULL DEFAULT 0,         -- When tag appears
  screen_x_pct            NUMERIC(5, 2) NOT NULL,             -- Hotspot horizontal coordinate (0-100%)
  screen_y_pct            NUMERIC(5, 2) NOT NULL,             -- Hotspot vertical coordinate (0-100%)
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3D / AR Assets attached to catalog products
CREATE TABLE social.product_3d_asset (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id              UUID NOT NULL,                      -- References catalog.product(id)
  glb_url                 TEXT NOT NULL,                      -- Universal glTF binary
  usdz_url                TEXT,                               -- Apple iOS AR Quick Look
  scale_meters_x          NUMERIC(6, 3),                      -- Physical bounding box (meters)
  scale_meters_y          NUMERIC(6, 3),
  scale_meters_z          NUMERIC(6, 3),
  supports_ar_placement   BOOLEAN NOT NULL DEFAULT true,
  supports_try_on         BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Collaborative group shopping carts
CREATE TABLE social.group_cart (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_account_id       UUID NOT NULL,
  name                    VARCHAR(64) NOT NULL,
  share_token             VARCHAR(64) UNIQUE NOT NULL,        -- Invite link token
  status                  VARCHAR(32) NOT NULL DEFAULT 'open', -- 'open' | 'locked_payment' | 'completed' | 'abandoned'
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Members participating in a group cart
CREATE TABLE social.group_cart_member (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_cart_id           UUID NOT NULL REFERENCES social.group_cart(id) ON DELETE CASCADE,
  account_id              UUID NOT NULL,
  allocated_amount_minor  BIGINT NOT NULL DEFAULT 0,
  payment_status          VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending' | 'authorized' | 'failed'
  joined_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_group_cart_member UNIQUE (group_cart_id, account_id)
);

-- Smart re-order replenishment subscription contracts
CREATE TABLE social.subscription_contract (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_account_id        UUID NOT NULL,
  product_id              UUID NOT NULL,
  variant_id              UUID NOT NULL,
  seller_id               UUID NOT NULL,
  quantity                INTEGER NOT NULL DEFAULT 1,
  cadence_interval_weeks  INTEGER NOT NULL,                   -- e.g. 2, 4, 8 weeks
  discount_percentage     INTEGER NOT NULL DEFAULT 10,        -- 10% subscription discount
  shipping_address_id     UUID NOT NULL,
  payment_method_id       UUID NOT NULL,
  status                  VARCHAR(32) NOT NULL DEFAULT 'active', -- 'active' | 'paused' | 'cancelled'
  next_order_date         DATE NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. UI Tests Specification (Social & Immersive Commerce)

### Comprehensive Social & Immersive Test Suite (Sorted & Grouped)

```
Group 1: 3D Interactive Viewer & AR "View in Your Room"
Group 2: Live Shopping Stream & In-Stream One-Tap Checkout
Group 3: Shoppable Video Feed & Interactive Hotspots
Group 4: Collaborative Group Carts ("Cart Splits")
Group 5: Smart Re-Order Subscriptions
```

#### Group 1: 3D Interactive Viewer & AR "View in Your Room"

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **1.1** | Interactive 3D Model Rotation & Zoom | PDP 3D Viewer (`<model-viewer>`) | On 3D-enabled product (e.g. Leather Sofa), click "View 3D"; drag to rotate 360°; pinch to zoom. | Model renders smoothly at 60fps; lighting reacts to orientation; texture detail sharpens on zoom. | `tmp/social/01-3d-model-orbital-view.png` |
| **1.2** | AR "View in Room" Trigger | Mobile Safari / Chrome | Tap "View in Your Space (AR)" button on supported mobile device. | Launches WebXR / Quick Look session; camera feed activates; true-scale 3D sofa places onto floor surface. | `tmp/social/02-ar-room-placement.png` |

#### Group 2: Live Shopping Stream & In-Stream One-Tap Checkout

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **2.1** | Live Stream Pinned Product & Instant Buy | Storefront Live Stream Page | Host pins "Ceramic Cookware Set"; viewer taps "Buy Now" on stream overlay card. | Slide-up modal opens over playing video; 1-click checkout executes; video playback does not stutter or pause. | `tmp/social/03-live-stream-pinned-product.png` |

#### Group 3: Shoppable Video Feed & Interactive Hotspots

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **3.1** | Tap Hotspot Tag on Vertical Feed | Video Feed (`/explore/feed`) | Scroll to styling clip; tap pulsing circular hotspot tag on sunglasses. | Floating product card pops up with price, rating, and "Add to Bag"; video pauses or loops smoothly. | `tmp/social/04-shoppable-video-hotspot.png` |

#### Group 4: Collaborative Group Carts ("Cart Splits")

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **4.1** | Join Group Cart & Equal Split Calculation | Group Cart Interface | Member accepts invite link; adds 2 items; group leader clicks "Split Evenly". | Total is divided equally across active members; individual authorization requests dispatch to each member's account. | `tmp/social/05-group-cart-split.png` |

#### Group 5: Smart Re-Order Subscriptions

| # | Test Scenario | Target Feature / Modal | Steps & User Interactions | Expected & Verified Outcome | Verification Artifact |
|---|---|---|---|---|---|
| **5.1** | Subscribe & Save Setup on PDP | PDP Purchase Option | Select "Subscribe & Save (10% off)"; choose "Deliver every 4 weeks"; checkout. | Subtotal applies 10% recurring discount; order places; active subscription contract appears in Buyer Account Hub. | `tmp/social/06-subscription-signup.png` |

---

## 6. Master Architectural Blueprint & Future Commerce Differentiators Gap Analysis & Flagged Implementations

The following specifications from `plan/gemini/GEMINI_FUTURE_COMMERCE_DIFFERENTIATORS_2026_10_28.md` and `plan/38-future-commerce-differentiators.md` represent gaps in the current implementation of Social and Community Commerce:

1. **[FLAGGED - Missing Implementation] Crowdsourced Group Carts & Split Pay Public Links (Plan 38, Section 3.1)**:
   - *Current State*: Group cart splits require registered platform users in a shared account session.
   - *Specification*: Public shareable split links (`/pay/split/:id`) for event registries (weddings, baby showers, birthdays). Unauthenticated and guest contributors can contribute arbitrary or itemized amounts via their preferred payment instruments directly into an escrow milestone holding.

2. **[FLAGGED - Missing Implementation] Neighborhood Drop-Point & Community Group Buys (Social P2P) (Plan 38, Section 3.3)**:
   - *Current State*: Social features are limited to buyer follow lists and live stream feeds.
   - *Specification*: Decentralized community network enabling trusted neighborhood residents or office administrators to act as Community Pickup Point Managers (`logistics.community_pickup_point`). Neighbors pool orders within local geofences to unlock wholesale tiers and zero shipping costs, supported by QR-code handover and manager commission ledgers.

