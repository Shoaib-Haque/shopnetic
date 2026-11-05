import { describe, expect, it } from 'vitest';
import { buildCorsOriginMatcher } from './cors.js';
import { loadApiEnv, type ApiEnv } from '../config/env.js';

const baseEnv: ApiEnv = {
  NODE_ENV: 'development',
  PORT: 4000,
  APP_VERSION: '0.0.0',
  DATABASE_URL: 'postgresql://localhost:5433/test',
  REDIS_URL: 'redis://localhost:6380',
  JWT_ISSUER: 'https://shopnetic.local',
  JWT_ACCESS_TTL_SECONDS: 900,
  AUTH_REFRESH_TTL_DAYS: 30,
  AUTH_STAFF_REFRESH_TTL_HOURS: 8,
  VERIFICATION_TTL_HOURS: 24,
  PASSWORD_RESET_TTL_HOURS: 1,
  TOTP_ISSUER: 'Shopnetic',
  TOTP_WINDOW_STEPS: 1,
  APP_WEB_URL: 'http://localhost:3000',
  ADMIN_WEB_URL: 'http://localhost:3002',
  ADMIN_BASE_PATH: 'x7f2k9t3m1qp',
  CORS_ALLOWED_ORIGINS: 'http://custom-preview.local:3000,http://preview.shopnetic.internal',
  CORS_ALLOW_LAN_IN_DEV: false,
  PASSWORD_BREACH_CHECK: false,
  DEV_AUTH_RELAXED: false,
  DEV_RATE_LIMIT_DISABLED: false,
  DEV_RESPONSE_DELAY_MS: 0,
  DEV_RESPONSE_DELAY_ROUTES: '',
  DEV_FAULT_STATUS: 0,
  DEV_FAULT_ROUTES: '',
  DEV_FAULT_BODY: 'envelope',
  STORAGE_PROVIDER: 'local',
  STORAGE_BUCKET: 'media',
  STORAGE_REGION: 'us-east-1',
  STORAGE_UPLOAD_BASE_URL: 'http://localhost:4000',
  STORAGE_PUBLIC_BASE_URL: 'http://localhost:4000/uploads',
  STORAGE_FORCE_PATH_STYLE: true,
};

function checkOrigin(matcher: ReturnType<typeof buildCorsOriginMatcher>, origin?: string): boolean {
  let allowed = false;
  matcher(origin, (_err, result) => {
    allowed = Boolean(result);
  });
  return allowed;
}

describe('buildCorsOriginMatcher', () => {
  it('allows requests without an Origin header (direct curls and server requests)', () => {
    const matcher = buildCorsOriginMatcher(baseEnv);
    expect(checkOrigin(matcher, undefined)).toBe(true);
  });

  it('allows explicitly configured APP_WEB_URL, ADMIN_WEB_URL, and CORS_ALLOWED_ORIGINS', () => {
    const matcher = buildCorsOriginMatcher(baseEnv);
    expect(checkOrigin(matcher, 'http://localhost:3000')).toBe(true);
    expect(checkOrigin(matcher, 'http://localhost:3002')).toBe(true);
    expect(checkOrigin(matcher, 'http://custom-preview.local:3000')).toBe(true);
    expect(checkOrigin(matcher, 'http://preview.shopnetic.internal')).toBe(true);
  });

  it('allows localhost in dev mode, but blocks unlisted LAN origins by default', () => {
    const matcher = buildCorsOriginMatcher(baseEnv);
    expect(checkOrigin(matcher, 'http://localhost:3000')).toBe(true);
    expect(checkOrigin(matcher, 'http://127.0.0.1:3002')).toBe(true);
    // Arbitrary unconfigured LAN origins blocked by default
    expect(checkOrigin(matcher, 'http://192.168.68.126:3012')).toBe(false);
    expect(checkOrigin(matcher, 'http://10.0.1.50:4000')).toBe(false);
    expect(checkOrigin(matcher, 'https://evil-attacker.com')).toBe(false);
  });

  it('allows LAN origins in dev mode only when CORS_ALLOW_LAN_IN_DEV is explicitly true', () => {
    const lanDevEnv: ApiEnv = {
      ...baseEnv,
      CORS_ALLOW_LAN_IN_DEV: true,
    };
    const matcher = buildCorsOriginMatcher(lanDevEnv);
    expect(checkOrigin(matcher, 'http://192.168.68.126:3012')).toBe(true);
    expect(checkOrigin(matcher, 'http://10.0.1.50:4000')).toBe(true);
    expect(checkOrigin(matcher, 'https://evil-attacker.com')).toBe(false);
  });

  it('strictly limits origins in production mode to explicit allowlist', () => {
    const prodEnv: ApiEnv = {
      ...baseEnv,
      NODE_ENV: 'production',
      APP_WEB_URL: 'https://shopnetic.com',
      ADMIN_WEB_URL: 'https://admin.shopnetic.com',
      CORS_ALLOWED_ORIGINS: 'https://partner.shopnetic.com',
      CORS_ALLOW_LAN_IN_DEV: false,
    };
    const matcher = buildCorsOriginMatcher(prodEnv);

    expect(checkOrigin(matcher, 'https://shopnetic.com')).toBe(true);
    expect(checkOrigin(matcher, 'https://admin.shopnetic.com')).toBe(true);
    expect(checkOrigin(matcher, 'https://partner.shopnetic.com')).toBe(true);

    // Unlisted LAN and external origins must be rejected in production
    expect(checkOrigin(matcher, 'http://192.168.68.126:3012')).toBe(false);
    expect(checkOrigin(matcher, 'http://localhost:3000')).toBe(false);
    expect(checkOrigin(matcher, 'https://evil-attacker.com')).toBe(false);
  });

  it('rejects CORS_ALLOW_LAN_IN_DEV in production boot check', () => {
    expect(() =>
      loadApiEnv({
        NODE_ENV: 'production',
        PORT: '4000',
        APP_VERSION: '1.0.0',
        DATABASE_URL: 'postgresql://prod:prod@localhost:5432/prod',
        REDIS_URL: 'redis://localhost:6379',
        JWT_ISSUER: 'https://shopnetic.com',
        JWT_ACCESS_TTL_SECONDS: '900',
        AUTH_REFRESH_TTL_DAYS: '30',
        AUTH_STAFF_REFRESH_TTL_HOURS: '8',
        VERIFICATION_TTL_HOURS: '24',
        PASSWORD_RESET_TTL_HOURS: '1',
        TOTP_ISSUER: 'Shopnetic',
        STORAGE_PROVIDER: 's3',
        STORAGE_BUCKET: 'media',
        STORAGE_REGION: 'us-east-1',
        CORS_ALLOW_LAN_IN_DEV: 'true',
      }),
    ).toThrow('CORS_ALLOW_LAN_IN_DEV must not be set in production');
  });
});
