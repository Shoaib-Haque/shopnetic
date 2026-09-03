# 16 — Security

Status: DRAFT
Related: `03-users-and-rbac.md`, `08-api-design.md`, `13-payments-and-payouts.md`

## 1. Authentication

### Passwords
- argon2id (tuned params), per-user salt (built into argon2). Never MD5/SHA.
- Breached-password check (k-anonymity API) at signup/change.
- Length ≥ 8 (no silly composition rules), max 128, allow spaces/emoji.
- Rate-limit + progressive delay + account lockout (soft) + CAPTCHA on abuse.

### Tokens
- **Access JWT**: 10–15 min TTL. Claims: `sub`, `sid` (session), `grants`
  (role+scope compact), `typ`, `iat`, `exp`, `iss`, `aud`. Signed **RS256/EdDSA**
  with rotating keys published via **JWKS**; `kid` in header.
- **Refresh token**: opaque, random 256-bit, stored **hashed**; delivered as
  `HttpOnly; Secure; SameSite=Lax` cookie (path-scoped to refresh endpoint).
  - **Rotation on every use**; old token immediately invalidated.
  - **Reuse detection**: if a rotated-out token is presented, revoke the whole
    token *family* (session) and alert the user ("new sign-in required").
  - Sliding expiry: 30 days buyer, 8 hours staff.
- Logout / "sign out everywhere" revokes session(s); a Redis denylist covers the
  ≤15-min access-token window.
- Permission change → session flagged; effective on next refresh, or forced
  immediately via a Realtime `session.invalidate` event.

### MFA
- TOTP (RFC 6238) + recovery codes. Optional for buyers, **mandatory for all
  staff and for sellers before first payout**. TOTP acceptance window is
  `TOTP_WINDOW_STEPS` × 30s each side (default 1; clock-skew tolerance).
- Step-up re-auth for sensitive actions (change email/bank, refund > cap,
  staff/role changes, break-glass).
- WebAuthn/passkeys as a later stronger option.
- **`DEV_AUTH_RELAXED`** (dev only) skips staff TOTP + the buyer email-verified
  gate for faster local iteration. It is inert unless `NODE_ENV=development`,
  has no effect under `NODE_ENV=test` (CI always runs the real flow), makes the
  process **fail at boot** under `NODE_ENV=production`, logs a `warn` when
  active, and never touches the password check, tokens, RBAC, or plane
  separation (CODING-RULES §R4).

### Sessions & devices
- Session list in account settings (device, IP, last seen), revoke individually.
- New-device / new-location login → email + optional block.
- Staff: optional IP allow-list, mandatory MFA, shorter sessions, no "remember me".

## 2. Authorization

- Central `authorize(actor, permission, resourceContext)` helper; **never** inline
  role string checks in business logic.
- **Deny by default.** Every endpoint declares required permission(s) + scope
  resolver. A Nest guard enforces it; missing declaration = 500 in dev,
  fail-closed in prod.
- **Object-level checks**: after "can this role do X", verify "on THIS object"
  (seller owns this offer; buyer owns this order). Prevents IDOR.
- 404 (not 403) when hiding existence from an unauthorized actor.
- Admin API on separate origin; storefront tokens rejected by admin guard
  (`aud` claim mismatch).
- Server-side enforcement is the only enforcement; client hiding is UX only.

## 3. Transport & platform

- TLS 1.2+ everywhere, HSTS (preload), TLS between services (mTLS internally).
- Security headers on all HTML: CSP (nonce-based, no `unsafe-inline`),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-
  origin`, `X-Frame-Options: DENY` / `frame-ancestors 'none'`,
  `Permissions-Policy` minimal, `Cross-Origin-Opener-Policy`.
- CORS: explicit allow-list of our own origins; credentials only for those; no
  wildcard with credentials.
- CSRF: SameSite cookies + double-submit / origin check on state-changing
  requests from cookie-authed contexts.
- Secrets: in a secret manager (Vault/Doppler/cloud), injected at runtime, never
  in repo/images/env files committed; rotation policy; different per environment.
- Dependency security: lockfiles, `npm audit`/Snyk/Dependabot in CI, SBOM,
  pinned base images, image scanning (Trivy), no `latest` tags.
- Container: non-root user, read-only FS where possible, drop capabilities,
  minimal distroless base, network policies (service can only reach what it needs).

## 4. Input / output safety

- Validate every boundary with Zod/DTO; reject unknown fields; size limits on
  bodies, arrays, strings, file uploads.
- Parameterized queries only (Prisma) — no string-built SQL; review any `$queryRaw`.
- Output encoding: React escapes by default; ban `dangerouslySetInnerHTML`
  except sanitized CMS content (DOMPurify server-side + allow-list).
- File uploads: signed direct-to-S3 URLs, type/size validation, content sniffing
  (magic bytes), image re-encode (strip EXIF/GPS), AV scan, served from a
  separate cookieless domain, never executable.
- SSRF: outbound HTTP from services goes through an allow-list proxy; block
  link-local/metadata IPs; validate webhook/callback URLs.
- Deserialization: JSON only, no `eval`, no dynamic `require`.

## 5. Rate limiting, bot & abuse defense

- Tiered token-bucket (Redis) per IP + per account + per endpoint class.
- Strict buckets: login, signup, OTP, password reset, coupon apply, checkout
  confirm, message send, review post, search (scraping).
- Bot management / WAF at the edge (managed rules + custom); CAPTCHA challenge on
  suspicious patterns.
- Scraping defense: pagination caps, no bulk catalog export endpoint, anomaly
  detection on request patterns.
- Enumeration defense: uniform responses/timing on login & "forgot password"
  (don't reveal whether an email exists).

## 6. Marketplace-specific threats

| Threat | Mitigation |
|--------|-----------|
| Account takeover (buyer/seller) | MFA, reuse detection, new-device alerts, step-up on payout/bank change, cool-off after credential change |
| Seller payout fraud (change bank, cash out, disappear) | Bank-change cool-off + re-verify, payout delay T+N after delivery, rolling reserve for new sellers, velocity/dispute monitoring, KYC |
| Fake/counterfeit listings | Catalog moderation, brand registry, report flow, image/text auto-moderation, seller trust score gating |
| Review manipulation | Verified-purchase only, one per purchase, velocity/graph analysis, device/IP clustering, ML/heuristic spam filter, moderation queue |
| Card testing / stolen cards | 3DS2, provider risk scoring, velocity limits, first-order caps, manual review queue, delayed capture |
| Coupon abuse | Server-side limits (total + per-user), stacking rules, one-account detection, min-spend, exclude-with combos, budget caps |
| Triangulation / drop-ship scams | Address/payment mismatch checks, dispute rate monitoring, hold payouts on "item not received" spikes |
| Buyer fraud (INR / friendly fraud) | Delivery proof, signature on high value, dispute evidence workflow, buyer trust score |
| Fee/price manipulation | Recompute all totals server-side at confirm; ignore client-sent prices entirely |
| IDOR on orders/messages/offers | Object-level auth on every resource, opaque non-sequential ids |
| Privilege escalation via role edit | Only Super Admin edits roles; four-eyes on Admin changes; audit + alert |
| Marketplace message channel abuse (off-platform payment, phishing) | Content filters, link/handle detection, rate limits, staff oversight, warnings |

## 7. Data protection & privacy

- **PII classification**: name, email, phone, address, IP, payment tokens, KYC
  docs → tagged; access logged; least-privilege.
- Encryption at rest (DB, object storage, backups); field-level encryption for
  the most sensitive (KYC refs, payout account refs).
- **Data minimization**: sellers see only the buyer data needed to fulfil their
  own sub-order (ship-to name/address), nothing else.
- **Retention & erasure**: per-entity retention windows; GDPR/CCPA export &
  delete requests → anonymize PII, retain transactional/financial records for
  legal minimum; documented runbook.
- Consent tracking for marketing; cookie consent; DPA with subprocessors.
- Logs/traces scrub PII and secrets (allow-list fields, redact by default);
  no card data, tokens, passwords, or full addresses in logs.
- Backups encrypted, access-controlled, restore-tested; separate account/region.

## 8. Auditing & detection

- Every privileged mutation → immutable `audit_event` (who/what/target/diff/
  reason/ip/correlation). Tamper-evident (hash chain) for staff actions.
- Security events → SIEM: auth failures, MFA changes, permission grants, payout/
  bank changes, break-glass, rate-limit trips, WAF blocks, admin bulk actions.
- Alerting: impossible-travel logins, permission-grant spikes, payout config
  change, mass data export, error-rate spikes, new outbound domains.
- Anomaly detection on order/payout/review/coupon velocity.

## 9. Secure SDLC

- Threat-model each new context/feature (STRIDE-lite) before build.
- PR checks: SAST (Semgrep/CodeQL), secret scanning (gitleaks), dependency audit,
  IaC scan (tfsec/checkov), container scan, lint rules banning risky APIs.
- Mandatory review for auth, payments, RBAC, and anything touching money or PII.
- Pre-launch: external pen test; ongoing bug bounty / responsible-disclosure
  policy + `security.txt`.
- Least-privilege cloud IAM; no long-lived cloud keys (OIDC/workload identity);
  break-glass procedures documented.
- Incident response runbook: detect → contain → eradicate → recover →
  post-mortem; breach-notification obligations tracked.

## 10. Environments
No prod data in non-prod (use anonymized/synthetic). Separate credentials,
networks, and cloud accounts per environment. Preview envs are not internet-
indexed and carry no real secrets.
