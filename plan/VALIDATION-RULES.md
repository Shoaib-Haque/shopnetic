# VALIDATION-RULES.md — Input Hardening Standard (first draft)

> Companion to `CODING-RULES.md` section P ("Validation & verification"). P1-P4
> already state the right principles in the abstract — this document exists because
> stating them wasn't enough to stop drift in practice. Use this doc's checklist
> (section 6) for every new or changed input field, in any app, from now on.

## 0. Why this exists

A field-by-field audit of the Offers & Stock feature (2026-10-30) found, on live
code, with both the frontend form schema and the backend `@shopnetic/contracts`
schema read side by side:

- **List Price and Sale Price had no upper bound at all, frontend or backend.**
  Harmless today only because the DB column is `BigInt`; nothing stopped an
  admin from saving a price of any size.
- **On-Hand Units and Safety Stock Threshold had no upper bound at all, frontend
  or backend — and the DB column is a 32-bit `Int` (hard ceiling
  2,147,483,647).** A value of `100000000000` was accepted by both the client and
  the Zod request schema, reached Postgres, overflowed, and came back as a raw,
  unhandled DB error flattened into a generic "Something went wrong. Please try
  again." — a real, reproducible failure, not a theoretical one.
- **5 of 6 warehouse address fields (line 1, line 2, city, state, postal code)
  had a `.max()` in the backend contract schema with no matching bound in the
  frontend form schema.** An overlong value passes client-side, submits, and the
  *only* thing that rejects it is the backend — surfacing as the generic,
  non-field-specific "Please check the highlighted fields." message, because the
  client never flagged anything itself. The admin has no way to tell which field
  was the problem.
- **Min Order Qty and Initial Stock were correctly bounded on *both* sides, with
  matching numbers** — but a single combined `.refine()` on the frontend used one
  error message for three distinct failure reasons (non-numeric, too low, too
  high), so exceeding the real maximum displayed "must be at least 1" / "cannot
  be negative" — both literally false statements about what was actually wrong.

None of this required an adversarial payload to find — ordinary testing with large
numbers and long strings hit all of it. That's the gap this document closes.

## 1. The failure mode, in one sentence

Frontend forms can't always literally import the backend's request schema
verbatim (numeric fields arrive from `<input>` as strings and need their own
typing/partial-input handling), so each form ends up with its *own* hand-written
Zod schema — and once there are two independently-maintained schemas instead of
one, their bounds silently drift apart. Nobody notices until a real value hits
the gap.

## 2. Rule V1 — Every bounded field is bounded in three places, not two

For anything that gets stored, three places can impose a limit:

1. the frontend form schema (instant UX feedback),
2. the `@shopnetic/contracts` request schema (the actual gate — P2: "client
   validation is UX; server validation is truth"),
3. the database column's own storage ceiling — `Int` tops out at
   `2,147,483,647`; `BigInt`/`numeric` effectively don't for any sane business
   value.

**Before adding or approving a new bounded field**: look up the real Prisma
column type first, pick a business-sane max that sits comfortably under that
column's hard ceiling (not one that barely fits), and only then write the Zod
bound. Never leave a 32-bit `Int` column backed by an unbounded (or
"min-only") Zod schema — that combination is exactly what broke On-Hand Units.

## 3. Rule V2 — Limits are named constants, not numbers typed twice

Export shared limit constants from `@shopnetic/contracts` next to the schema
that uses them (e.g. `OFFER_QTY_MAX = 999_999`, `WAREHOUSE_LINE1_MAX = 200`,
`STOCK_UNITS_MAX = 999_999`), and have each frontend form's local schema
**import and reuse those same constants** in its own `.max()` calls instead of
retyping the literal number by hand. A literal number like `999999` or `200`
showing up in two different files with no shared import behind it is a
code-review flag from now on — it's exactly how 5 of the 6 warehouse address
fields drifted.

## 4. Rule V3 — One failure condition, one message

Never let a single `.refine()`/check cover more than one distinct rejection
reason. If a field can fail for being non-numeric, below the min, *or* above
the max, that's three separate checks with three separately-worded, accurate
messages — not one combined check reusing a message that's only true for the
most common case. Test: read the message with the actual failing value in mind
— does the sentence describe *this* value's actual problem, or just *a*
possible problem with the field in general? If it's the latter, split the
check.

## 5. Rule V4 — A backend bound with no frontend mirror is a shipped bug

If `@shopnetic/contracts` has a `.min()`/`.max()` that a form's local schema
doesn't mirror, the PR isn't done (ties into `CODING-RULES.md` A5/K). The
concrete failure mode is specific and bad: the value passes client-side,
submits, and the *only* thing stopping it is a generic, non-field-specific
error banner that can't say which field was wrong — because the client never
flagged it. This is the single most common gap found in the first audit pass
(5 of 6 fields in one form) and is the fastest thing to check for in any
existing or new form: open the frontend schema and the contract schema side by
side, field by field.

## 6. Rule V5 — Foreseeable rejections get a mapped error code, not the fallback

Per `CODING-RULES.md` F7 ("validation messages are specific"): if a specific,
foreseeable rejection — an overlong address field, a malformed price — is
something a real user will actually hit, it should have a dedicated `AppError`
code and a dedicated message key, the same way `OFFER_PRICE_INVALID` /
`OFFER_SALE_PRICE_INVALID` already exist for offer pricing. The generic
`VALIDATION_ERROR` → "Please check the highlighted fields." fallback exists for
genuinely unexpected/malformed payloads — not for a field length limit that was
already fully known at schema-authoring time.

## 7. Rule V6 — The field-hardening checklist

Fill this out for every new or changed input field, frontend or backend. An
empty/unknown cell is not acceptable to merge.

| Field | Type | Min | Max | Format / regex | Frontend enforced (HTML attr + schema)? | Backend enforced (contract schema)? | DB column + ceiling confirmed? | One message per failure mode? | Mapped error code (not generic fallback)? |
|---|---|---|---|---|---|---|---|---|---|
| *(fill in)* | | | | | | | | | |

## 8. Worked example — 2026-10-30 Offers & Stock audit (first application of this checklist)

**Create/Edit Seller Offer**

| Field | Frontend max | Backend max | DB column | Verdict |
|---|---|---|---|---|
| List Price | none | none | `BigInt` | ❌ missing max, both sides (low risk — DB won't overflow, but no sane ceiling exists) |
| Sale Price | none | none | `BigInt` | ❌ missing max, both sides |
| Handling Days | 30 | 30 | `Int` | ✅ hardened, matches |
| Min Order Qty | 999,999 | 999,999 | `Int` | ✅ bounds match — ❌ message wrong on max-exceeded (V3) |
| Max Order Qty | 999,999 | 999,999 | `Int` | ✅ hardened, matches, messages already correct |
| Initial Stock | 999,999 | 999,999 | `Int` | ✅ bounds match — ❌ message wrong on max-exceeded (V3) |
| Condition Notes | 500 (+ HTML `maxLength`) | 500 | text | ✅ hardened, matches |

**New Warehouse**

| Field | Frontend max | Backend max | Verdict |
|---|---|---|---|
| Warehouse Name | 100 | 100 | ✅ matches |
| Address Line 1 | none | 200 | ❌ missing frontend max (V4) |
| Address Line 2 | none | 200 | ❌ missing frontend max (V4) |
| City | none | 100 | ❌ missing frontend max (V4) |
| State | none | 100 | ❌ missing frontend max (V4) |
| Postal/ZIP Code | none | 20 | ❌ missing frontend max (V4) |

**Adjust Stock Levels**

| Field | Frontend max | Backend max | DB column | Verdict |
|---|---|---|---|---|
| On-Hand Units | none | none | `Int` (ceiling 2,147,483,647) | ❌ missing max, both sides — **reproducibly crashes** (V1) |
| Safety Stock Threshold | none | none | `Int` | ❌ missing max, both sides — same risk |

Remediation for every ❌ row above is tracked in `tmp/claude.txt` (Group 6) and is
the first real backlog this document's checklist produced.

## 9. Where this applies next

This audit only covered Offers & Stock. Every `*-form-modal.tsx` across
Catalog (categories, brands, option types, value sets, products, variants,
media) follows the same pattern — a hand-written local Zod schema next to a
`@shopnetic/contracts` request schema — so the same V1-V5 gaps plausibly exist
there too, **unverified**. A follow-up sweep of those forms against this
checklist is recommended before assuming they're clean.
