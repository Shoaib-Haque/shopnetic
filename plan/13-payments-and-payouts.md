# 13 — Payments & Payouts

Status: DRAFT
Related: `12-cart-checkout-orders.md`, `07-data-model.md`, `16-security.md`

## 1. Model: platform-collected marketplace payments + escrow + double-entry ledger

The platform is the payment collector. Buyer pays the platform; platform holds
funds in **escrow**; on fulfilment the platform releases funds (minus commission
and fees) to the seller's **balance**; balances are paid out on a schedule.

Every movement is recorded as balanced **double-entry ledger** journals. Balances
are *derived from the ledger*, never computed ad hoc.

### Why escrow + ledger

- Buyer protection: seller is paid only after they ship/deliver.
- Dispute/refund handling has real funds to reverse.
- Auditable, reconcilable against the payment provider to the cent.
- Regulatory posture: clear record of custody.

## 2. Payment provider strategy

- **Abstraction first**: `PaymentProvider` interface (authorize, capture, refund,
  void, tokenize, webhook-verify, payout*) so we can support/switch providers and
  regions.
- **Prefer a provider with native marketplace/split support** (Stripe Connect,
  Adyen for Platforms, or a regional equivalent) — it handles KYC, split
  payouts, and compliance so we don't build money transmission ourselves.
  - If using Connect-style: much of escrow/payout is delegated; our ledger
    becomes a mirror/reconciliation layer + commission accounting.
  - If using a plain gateway: we operate escrow ourselves and need the ledger as
    the system of record + a payout rail (bank transfer API).
- **Region note**: provider choice depends on launch country (→ `22` open
  question). Design assumes "marketplace-capable provider", with the manual-escrow
  path as fallback.

## 3. Payment methods (per region / config)

Card (3DS2/SCA), wallets (Apple/Google Pay), bank redirect (region-specific),
Cash on Delivery (per seller + per region toggle; settled differently — no
gateway capture, collected on delivery, reconciled manually), store credit,
split (store credit + one other method). No raw PAN ever touches our servers —
tokenization / hosted fields / provider SDK only. PCI scope kept to SAQ-A.

## 4. Money flow (capture-on-ship variant — see `12` §7)

```
Order placed:
  authorize(payment_intent, grandTotal)        [provider]
  journal "authorization" (memo only, no balance move) or skip

Sub-order shipped:
  capture(amount = sub_order total)             [provider]
  journal "sale":
    debit  gateway_clearing        (net received)
    debit  platform_fees_expense   (provider fee)      -- if we absorb
    credit escrow:seller:{id}      (sub_order total)
  journal "commission_accrual":
    debit  escrow:seller:{id}      (commission)
    credit platform_revenue        (commission)

Delivered + review window passes, no dispute:
  journal "escrow_release":
    debit  escrow:seller:{id}      (remaining = total - commission - fees)
    credit seller_available:{id}
  (reserve % may be split into seller_reserve:{id})

Payout run:
  journal "payout":
    debit  seller_available:{id}
    credit bank_clearing
  provider/bank transfer executes; on confirm -> mark payout paid
  on failure -> reverse to seller_available, retry, alert
```

Refund reverses the relevant journals (escrow or seller_available or reserve →
buyer / store_credit), proportionally for partials and split payments.

## 5. Commission & fees

- **Commission**: default % (bps) set by Super Admin; per-category overrides;
  per-seller overrides; promotional rates. Snapshotted onto the sub-order at
  placement so later config changes don't rewrite history.
- **Payment processing fee**: pass-through or absorbed (config).
- **Optional fees**: shipping-label markup, listing fees, dispute fee on
  seller-fault chargebacks.
- All fees appear on seller statements and in the ledger.

## 6. Seller balances & payouts

| Balance bucket | Meaning |
|----------------|---------|
| `pending` | In escrow (captured, not yet released) |
| `available` | Released, payable next run |
| `on_hold` | Frozen for disputes/chargebacks/risk |
| `reserve` | Rolling reserve for new/high-risk sellers |

- **Payout schedule**: configurable (e.g. weekly, T+2 after delivery). Minimum
  payout threshold; carry remainder.
- **Payout run**: batch job → per-seller `payout` → provider/bank transfer →
  reconcile on webhook/statement → generate statement PDF.
- **Holds**: dispute open, chargeback, KYC re-verification, suspicious activity,
  Admin manual hold. Released by resolution or Admin.
- **Negative balance** (refund/chargeback after payout): recover from next
  payout; if persistent, collections flag + Admin action.
- Payout account changes → cool-off period + re-verification before next payout.

## 7. Webhooks (inbound)

- Verify signature; dedupe by provider event id; process idempotently; ack fast,
  work async.
- Handle: `payment.succeeded/failed`, `charge.captured`, `refund.updated`,
  `dispute.created/closed` (chargeback), `payout.paid/failed`,
  `account.updated` (seller KYC status for Connect-style).
- Out-of-order safe (state machine + version). Missing webhook → reconciliation
  job polls provider.
- Alert on webhook backlog / signature failures / unknown event types.

## 8. Reconciliation

- Daily job: provider balance & transaction report vs our ledger. Any mismatch →
  exception queue + alert, block payouts if variance > threshold.
- Month-end close: freeze period, generate platform P&L (commission revenue,
  fees, refunds, chargeback losses), seller statements, tax reports.
- Every ledger journal references its source (`ref_type`, `ref_id`) for traceability.

## 9. Refunds (money side; flow in `12` §6)

- Source of funds priority: seller escrow → seller available → seller reserve →
  platform (last resort, flag seller).
- Destination: original payment method (via provider refund) or store credit
  (instant, ledger-only).
- Partial refunds allocate across lines, discounts, tax, shipping per policy.
- COD refunds: no gateway capture happened → refund via store credit or bank
  transfer to buyer; reconciled manually.

## 10. Fraud & risk (see `16`)

- Velocity checks (orders/cards/addresses per time), device fingerprinting,
  provider risk score, mismatched billing/shipping, high-risk BIN, first-order
  limits.
- Actions: step-up 3DS, manual review queue (Trust & Safety), delay capture,
  block.
- Seller-side risk: sudden GMV spike, many "item not received" disputes, listing
  scams → auto-hold payouts + review.

## 11. Compliance & data

- PCI DSS SAQ-A (no card data on our systems).
- Strong Customer Authentication / 3DS2 where mandated.
- KYC/AML delegated to provider where possible; store verification *status*, not
  raw documents (docs in provider or encrypted restricted bucket).
- Tax: seller is merchant of record; platform may have marketplace-facilitator
  obligations depending on jurisdiction (→ `22`).
- Store financial records for the legally required retention period even after
  account deletion (anonymize PII, keep transactional data).

## 12. Testing focus

- Ledger always balances (property test: every journal sums to zero; account
  balance = Σ entries).
- Capture/refund idempotency under duplicate webhooks.
- Partial capture + partial refund + split payment math.
- Payout failure → reversal → retry.
- Chargeback after payout → negative balance recovery.
- Provider outage → queue captures, degrade gracefully, no double charge.
- Reconciliation detects an injected discrepancy.
