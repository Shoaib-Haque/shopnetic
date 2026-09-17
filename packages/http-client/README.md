# @shopnetic/http-client

Small client-side utilities shared by every app's own BFF layer (Next.js
route handlers under `app/api/*` proxying to the identity API): a JSON
fetch wrapper that never throws, the RFC-9457-ish error-envelope code
extractor, and a `Set-Cookie` header parser for reading a refresh cookie's
value (or "was cleared" signal) back out of a BFF route's own response.

Originally hand-duplicated (byte-for-byte, in `postJson`/`extractErrorCode`'s
case) between `apps/admin` and `apps/storefront`, each app having built its
own staff/buyer auth flow independently. Extracted here once a second,
independent copy existed — see `plan/CODING-RULES.md`'s dated entry on this.
