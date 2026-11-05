import type { ApiEnv } from '../config/env.js';

function toOrigin(urlStr: string): string | null {
  try {
    return new URL(urlStr).origin;
  } catch {
    return null;
  }
}

export function buildCorsOriginMatcher(
  env: ApiEnv,
): (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void {
  const allowed = new Set<string>();

  const appOrigin = toOrigin(env.APP_WEB_URL);
  if (appOrigin) allowed.add(appOrigin);

  const adminOrigin = toOrigin(env.ADMIN_WEB_URL);
  if (adminOrigin) allowed.add(adminOrigin);

  if (env.CORS_ALLOWED_ORIGINS) {
    for (const raw of env.CORS_ALLOWED_ORIGINS.split(',')) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const extraOrigin = toOrigin(trimmed);
      if (extraOrigin) allowed.add(extraOrigin);
    }
  }

  const isDev = env.NODE_ENV === 'development';
  const localhostRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  const lanRegex =
    /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/;

  return (origin, callback) => {
    // Direct server-to-server or curl calls without Origin header are allowed
    if (!origin) {
      return callback(null, true);
    }
    if (allowed.has(origin)) {
      return callback(null, true);
    }
    if (isDev && localhostRegex.test(origin)) {
      return callback(null, true);
    }
    if (isDev && env.CORS_ALLOW_LAN_IN_DEV && lanRegex.test(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  };
}
