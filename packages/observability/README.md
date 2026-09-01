# @shopnetic/observability

Shared structured logger (+ tracing/metrics bootstrap later).

```ts
import { createLogger } from '@shopnetic/observability';
const log = createLogger({ service: 'api' });
log.info({ orderId }, 'order placed');
```

STUB — see `plan/18-observability.md` and `plan/CODING-RULES.md` §O. Redaction
allow-list, OTel correlation, and request-scoped child loggers are pending.
