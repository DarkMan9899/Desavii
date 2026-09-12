/**
 * Configuration loader.
 *
 * Implements BACKEND_ARCHITECTURE.md §18 (Configuration Management) and
 * §19 (Environment Variables): every required environment variable is
 * validated for presence and type ONCE, at process start, before the
 * application accepts its first request. A missing or malformed value
 * is a fail-fast startup error — never a runtime surprise discovered on
 * the first request that happens to need it.
 *
 * No secret is ever logged (see src/logging/logger.js's redaction rule).
 */

import 'dotenv/config';
import { cleanEnv, str, num, url, bool } from 'envalid';

// Known, source-committed placeholder values (see JWT_ACCESS_SECRET/
// JWT_REFRESH_SECRET/CONNECTOR_CONFIG_ENCRYPTION_KEY below) — referenced
// both as their dev/test default AND by
// #assertProductionSecretsAreConfigured at the bottom of this file, which
// refuses to let a production process boot while any of these env vars
// still equals one of these. Defined once, here, so the defaults and the
// guard can never silently drift apart.
const DEV_ONLY_JWT_ACCESS_SECRET = 'dev-only-access-secret-change-me';
const DEV_ONLY_JWT_REFRESH_SECRET = 'dev-only-refresh-secret-change-me';
const DEV_ONLY_CONNECTOR_CONFIG_ENCRYPTION_KEY =
  'dev-only-connector-config-key-change-me';

const env = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ['development', 'staging', 'production', 'test'],
    default: 'development',
  }),
  PORT: num({ default: 4000 }),

  // Database (DATABASE_ARCHITECTURE.md — MySQL 8.x)
  DATABASE_HOST: str({ default: 'localhost' }),
  DATABASE_PORT: num({ default: 3306 }),
  DATABASE_NAME: str({ default: 'travelhub' }),
  DATABASE_USER: str({ default: 'travelhub' }),
  DATABASE_PASSWORD: str({ default: '' }),
  // Isolated database for the `integration` Jest project (Sprint 5 §"test
  // database isolation") — never the same database as DATABASE_NAME, so
  // integration tests can freely migrate/seed/truncate without touching
  // development data.
  DATABASE_NAME_TEST: str({ default: 'travelhub_test' }),

  // Redis (BACKEND_ARCHITECTURE.md §38)
  REDIS_URL: url({ default: 'redis://localhost:6379' }),

  // JWT (BACKEND_ARCHITECTURE.md §12)
  JWT_ACCESS_SECRET: str({ default: DEV_ONLY_JWT_ACCESS_SECRET }),
  JWT_REFRESH_SECRET: str({ default: DEV_ONLY_JWT_REFRESH_SECRET }),
  JWT_ACCESS_EXPIRY: str({ default: '15m' }),
  JWT_REFRESH_EXPIRY: str({ default: '30d' }),

  // Booking Engine constants (BOOKING_ENGINE_ARCHITECTURE.md §5.2) — tunable
  // without a deploy, per BACKEND_ARCHITECTURE.md §18's system_settings note.
  RESERVATION_HOLD_DURATION_MINUTES: num({ default: 15 }),
  // Sprint 10: how long a booking may sit in PENDING_VENDOR before the
  // scheduled sweep auto-expires it — a separate, much longer window than
  // the reservation-hold TTL above (that one guards checkout; this one
  // guards a vendor's response time on an already-created booking).
  BOOKING_PENDING_VENDOR_SLA_HOURS: num({ default: 48 }),

  // Rate limiting (BACKEND_ARCHITECTURE.md §48 / API_SPECIFICATION.md §17)
  RATE_LIMIT_AUTHENTICATED_PER_MINUTE: num({ default: 300 }),
  RATE_LIMIT_PUBLIC_PER_MINUTE: num({ default: 20 }),
  RATE_LIMIT_SENSITIVE_PER_MINUTE: num({ default: 10 }),
  // A separate, still-bounded tier for the build-time `prerender.mjs`
  // pipeline (Phase 20 SEO), never the public internet: a full site crawl
  // easily exceeds the public tier's 20/min in real, sequential traffic
  // (228 routes x several data fetches each), and authenticating as a
  // real user to reach the authenticated tier isn't an option — it would
  // bake a specific logged-in header state into HTML a crawler must see
  // as anonymous. Only requests presenting the exact
  // PRERENDER_INTERNAL_TOKEN secret AND originating from the loopback
  // interface (rateLimiter.js's isLoopbackRequest — req.ip is never
  // derived from a spoofable header here, this app never sets `trust
  // proxy`) use this tier; every other request, including one that only
  // guesses the token from off-host, still hits the normal public tier.
  // Empty by default: the tier is unreachable until an operator opts in.
  RATE_LIMIT_INTERNAL_BUILD_PER_MINUTE: num({ default: 1000 }),
  PRERENDER_INTERNAL_TOKEN: str({ default: '' }),

  // CORS (BACKEND_ARCHITECTURE.md §47)
  CORS_ALLOWED_ORIGINS: str({ default: 'http://localhost:5173' }),

  // P1.4 (Master Roadmap) — the frontend origin a staff-invitation email
  // links back to (`{WEB_APP_URL}/{locale}/partner/invitations/{token}`).
  // Same default as the first CORS origin above; a real deployment sets
  // both to the actual public web app URL.
  WEB_APP_URL: str({ default: 'http://localhost:5173' }),

  // Connector credential encryption (P0.6, Master Roadmap) — encrypts
  // inventory_connections.config (may hold a real iCal/PMS/OTA API key)
  // at rest. Same "always has a working dev default, production MUST
  // override it" pattern this file already uses for JWT_ACCESS_SECRET/
  // JWT_REFRESH_SECRET above, now enforced the same way too (see
  // #assertProductionSecretsAreConfigured below) — a production process
  // left on this default would silently encrypt every partner's
  // connector credentials with a key published in this file's own
  // history, which is equivalent to not encrypting them at all. Any
  // string works as input once a real one IS configured
  // (connectorCredentialCipher.js derives a real 32-byte AES-256 key
  // from it via SHA-256, so it does not need to be exactly 32 bytes
  // itself) — there is no format/length requirement for the guard below
  // to check beyond "present and not this known placeholder."
  CONNECTOR_CONFIG_ENCRYPTION_KEY: str({
    default: DEV_ONLY_CONNECTOR_CONFIG_ENCRYPTION_KEY,
  }),

  // Object storage (P0.7, Master Roadmap) — `local` (LocalStorageProvider,
  // disk-backed, dev-only) is the default; `s3` selects S3StorageProvider,
  // which works against real AWS S3 *and* any S3-compatible provider
  // (Cloudflare R2, DigitalOcean Spaces, MinIO) via STORAGE_S3_ENDPOINT.
  // Selecting `s3` with no bucket configured is a runtime error at first
  // use, never a boot crash — matches this file's own AI/Payments
  // provider precedent exactly.
  STORAGE_PROVIDER: str({ choices: ['local', 's3'], default: 'local' }),
  STORAGE_S3_BUCKET: str({ default: '' }),
  // 'auto' works for R2; a real AWS deployment should set an actual
  // region (e.g. 'eu-central-1').
  STORAGE_S3_REGION: str({ default: 'auto' }),
  // Empty targets real AWS S3 (the SDK's own default endpoint). Set to
  // an R2/Spaces/MinIO endpoint URL to target one of those instead — no
  // code change, just this one var.
  STORAGE_S3_ENDPOINT: str({ default: '' }),
  STORAGE_S3_ACCESS_KEY_ID: str({ default: '' }),
  STORAGE_S3_SECRET_ACCESS_KEY: str({ default: '' }),
  // MinIO (and some other S3-compatible servers) require path-style
  // addressing (https://host/bucket/key) instead of virtual-hosted-style
  // (https://bucket.host/key), which is what AWS S3/R2/Spaces expect.
  STORAGE_S3_FORCE_PATH_STYLE: bool({ default: false }),
  // The URL prefix `getUrl()` builds public object URLs from — a CDN
  // domain, a custom domain in front of the bucket, or the bucket's own
  // public endpoint. Never derived automatically: which URL shape is
  // "correct" depends entirely on how the bucket is actually exposed,
  // which this app has no way to know on its own.
  STORAGE_S3_PUBLIC_BASE_URL: str({ default: '' }),

  // Email delivery (P0.3, Master Roadmap) — `console` (a real, observable
  // log line, never a silent no-op) is the default; `resend` selects a
  // real provider. Selecting `resend` with no key configured degrades to
  // a clear, logged, non-throwing failure result at send time (see
  // resendEmailProvider.js), never a boot crash — same precedent as
  // every other optional provider in this file.
  EMAIL_PROVIDER: str({ choices: ['console', 'resend'], default: 'console' }),
  RESEND_API_KEY: str({ default: '' }),
  RESEND_FROM_ADDRESS: str({ default: '' }),

  // Error tracking / observability (P0.8, Master Roadmap) — `none` (the
  // structured logger only, already this app's default today) requires
  // no account; `sentry` selects a real Sentry.io adapter. There was
  // previously no error-tracking provider of any kind wired into this
  // app — an uncaught exception or a failed background job had no
  // signal beyond manually reading stdout logs.
  ERROR_TRACKING_PROVIDER: str({
    choices: ['none', 'sentry'],
    default: 'none',
  }),
  SENTRY_DSN: str({ default: '' }),

  // Logging
  LOG_LEVEL: str({
    choices: ['fatal', 'error', 'warn', 'info', 'debug', 'trace'],
    default: 'info',
  }),

  // AI Platform (Phase 15) — every var below defaults to empty/safe, so
  // the app always boots without any of these set (matches this file's
  // established all-defaults pattern). Selecting a non-'local' provider
  // with no matching key is a runtime AiService error, never a boot
  // crash — see providers/providerRegistry.js.
  AI_DEFAULT_PROVIDER: str({ default: 'local' }),
  AI_CACHE_TTL_SECONDS: num({ default: 3600 }),
  AI_MAX_RETRIES: num({ default: 2 }),
  OPENAI_API_KEY: str({ default: '' }),
  OPENAI_MODEL: str({ default: 'gpt-4o-mini' }),
  ANTHROPIC_API_KEY: str({ default: '' }),
  ANTHROPIC_MODEL: str({ default: 'claude-sonnet-5' }),
  GEMINI_API_KEY: str({ default: '' }),
  GEMINI_MODEL: str({ default: 'gemini-2.0-flash' }),
  AZURE_OPENAI_API_KEY: str({ default: '' }),
  AZURE_OPENAI_ENDPOINT: str({ default: '' }),
  AZURE_OPENAI_DEPLOYMENT: str({ default: '' }),
  AZURE_OPENAI_API_VERSION: str({ default: '2024-06-01' }),
  OLLAMA_BASE_URL: str({ default: 'http://localhost:11434' }),
  OLLAMA_MODEL: str({ default: 'llama3.1' }),

  // Multi-currency / FX (Pass 8) — official Central Bank of Armenia SOAP
  // service is the only live provider; matches this file's established
  // all-defaults pattern (an app with no FX vars set still boots, and
  // getModuleLogger-based providers report failures at call time, never
  // a boot crash). `NODE_ENV=test` always uses the deterministic
  // FixtureExchangeRateProvider regardless of FX_PROVIDER (see
  // modules/fx/module.container.js) — brief §29's "CI must not depend on
  // live CBA availability."
  FX_PROVIDER: str({ choices: ['cba', 'fixture'], default: 'cba' }),
  CBA_EXCHANGE_RATE_URL: str({
    default: 'https://api.cba.am/exchangerates.asmx',
  }),
  FX_HTTP_TIMEOUT_MS: num({ default: 8000 }),
  // CBA publishes rates roughly once a day — an hour keeps display prices
  // fresh without a request-per-price-render (brief §11).
  FX_RATE_CACHE_TTL_SECONDS: num({ default: 3600 }),

  // Payment Infrastructure (Phase 16) — every var below defaults to
  // empty/safe, matching this file's established all-defaults pattern.
  // `local` (never touches real money) is the default and only enabled
  // provider until real credentials exist; selecting `stripe` without a
  // secret key is a runtime PaymentService error in development/test,
  // but a loud boot-time crash in production — see
  // modules/payments/providers/paymentProviderRegistry.js's
  // `#assertSafeForProduction` (Stripe go-live preflight fail-closed
  // guard). `choices` closes off any other value (typos, future
  // providers not yet wired) at boot too, for every environment.
  PAYMENT_DEFAULT_PROVIDER: str({
    choices: ['local', 'stripe'],
    default: 'local',
  }),
  // Go-live sequencing: the marketplace launches before real payments are
  // switched on. `default: false` is production's safe default — turning
  // real money movement on is an explicit, deliberate opt-in via this
  // flag, never an accidental side effect of setting NODE_ENV or
  // PAYMENT_DEFAULT_PROVIDER alone. `devDefault: true` (envalid's
  // NODE_ENV!=='production' fallback) preserves today's behavior for
  // development/test — LocalPaymentProvider keeps working out of the box,
  // no env var to flip, exactly as before this flag existed. See
  // `paymentProviderRegistry.js`'s `#assertSafeForProduction` for how
  // this interacts with the provider fail-closed guard.
  PAYMENTS_ENABLED: bool({ default: false, devDefault: true }),
  STRIPE_SECRET_KEY: str({ default: '' }),
  STRIPE_WEBHOOK_SECRET: str({ default: '' }),
  STRIPE_API_VERSION: str({ default: '2024-06-20' }),
  // The ONLY Stripe value ever safe to send to the browser (Stripe's own
  // design: it can create a PaymentIntent confirmation, nothing more —
  // never a charge, never a secret-key-equivalent capability). Read
  // through `GET /payments/config` by the frontend's Stripe Elements
  // integration to mount `loadStripe(...)`. Never confuse with
  // STRIPE_SECRET_KEY above, which must never leave the backend.
  STRIPE_PUBLISHABLE_KEY: str({ default: '' }),
});

/**
 * Frozen, validated configuration object — the single import point every
 * module uses for configuration. Never read `process.env` directly
 * outside this file (BACKEND_ARCHITECTURE.md §18).
 */
const config = Object.freeze({
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,

  database: Object.freeze({
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT,
    name: env.NODE_ENV === 'test' ? env.DATABASE_NAME_TEST : env.DATABASE_NAME,
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
  }),

  redis: Object.freeze({
    url: env.REDIS_URL,
  }),

  jwt: Object.freeze({
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessExpiry: env.JWT_ACCESS_EXPIRY,
    refreshExpiry: env.JWT_REFRESH_EXPIRY,
  }),

  booking: Object.freeze({
    holdDurationMinutes: env.RESERVATION_HOLD_DURATION_MINUTES,
    pendingVendorSlaHours: env.BOOKING_PENDING_VENDOR_SLA_HOURS,
  }),

  rateLimit: Object.freeze({
    authenticatedPerMinute: env.RATE_LIMIT_AUTHENTICATED_PER_MINUTE,
    publicPerMinute: env.RATE_LIMIT_PUBLIC_PER_MINUTE,
    sensitivePerMinute: env.RATE_LIMIT_SENSITIVE_PER_MINUTE,
    internalBuildPerMinute: env.RATE_LIMIT_INTERNAL_BUILD_PER_MINUTE,
  }),

  prerenderInternalToken: env.PRERENDER_INTERNAL_TOKEN,

  cors: Object.freeze({
    allowedOrigins: env.CORS_ALLOWED_ORIGINS.split(',').map((origin) =>
      origin.trim(),
    ),
  }),

  webAppUrl: env.WEB_APP_URL,

  security: Object.freeze({
    connectorConfigEncryptionKey: env.CONNECTOR_CONFIG_ENCRYPTION_KEY,
  }),

  storage: Object.freeze({
    provider: env.STORAGE_PROVIDER,
    s3: Object.freeze({
      bucket: env.STORAGE_S3_BUCKET,
      region: env.STORAGE_S3_REGION,
      endpoint: env.STORAGE_S3_ENDPOINT || undefined,
      accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
      secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.STORAGE_S3_FORCE_PATH_STYLE,
      publicBaseUrl: env.STORAGE_S3_PUBLIC_BASE_URL,
    }),
  }),

  email: Object.freeze({
    provider: env.EMAIL_PROVIDER,
    resend: Object.freeze({
      apiKey: env.RESEND_API_KEY,
      fromAddress: env.RESEND_FROM_ADDRESS,
    }),
  }),

  errorTracking: Object.freeze({
    provider: env.ERROR_TRACKING_PROVIDER,
    sentry: Object.freeze({
      dsn: env.SENTRY_DSN,
    }),
  }),

  logging: Object.freeze({
    level: env.LOG_LEVEL,
  }),

  ai: Object.freeze({
    defaultProvider: env.AI_DEFAULT_PROVIDER,
    cacheTtlSeconds: env.AI_CACHE_TTL_SECONDS,
    maxRetries: env.AI_MAX_RETRIES,
    openai: Object.freeze({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
    }),
    anthropic: Object.freeze({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL,
    }),
    gemini: Object.freeze({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
    }),
    azureOpenai: Object.freeze({
      apiKey: env.AZURE_OPENAI_API_KEY,
      endpoint: env.AZURE_OPENAI_ENDPOINT,
      deployment: env.AZURE_OPENAI_DEPLOYMENT,
      apiVersion: env.AZURE_OPENAI_API_VERSION,
    }),
    ollama: Object.freeze({
      baseUrl: env.OLLAMA_BASE_URL,
      model: env.OLLAMA_MODEL,
    }),
  }),

  fx: Object.freeze({
    provider: env.NODE_ENV === 'test' ? 'fixture' : env.FX_PROVIDER,
    cbaExchangeRateUrl: env.CBA_EXCHANGE_RATE_URL,
    httpTimeoutMs: env.FX_HTTP_TIMEOUT_MS,
    rateCacheTtlSeconds: env.FX_RATE_CACHE_TTL_SECONDS,
  }),

  payments: Object.freeze({
    enabled: env.PAYMENTS_ENABLED,
    defaultProvider: env.PAYMENT_DEFAULT_PROVIDER,
    stripe: Object.freeze({
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      apiVersion: env.STRIPE_API_VERSION,
      publishableKey: env.STRIPE_PUBLISHABLE_KEY,
    }),
  }),
});

/**
 * Secret go-live preflight — mirrors `paymentProviderRegistry.js`'s
 * `#assertSafeForProduction` (BACKEND_ARCHITECTURE.md's established
 * fail-closed shape for "this is safe to leave on a convenient default in
 * development, but production must never boot on it"). Covers every
 * secret in this file that (a) has a source-committed placeholder
 * default for dev/test convenience and (b) would silently downgrade a
 * real security property to "not actually protected" if left on that
 * default in production — currently the two JWT signing secrets and the
 * connector-credential encryption key. Missing (empty string — none of
 * these three are `required: true`) is treated identically to "still the
 * known placeholder": both fail closed the same way. Never fires outside
 * production; development/test keep today's zero-config convenience.
 */
function assertProductionSecretsAreConfigured() {
  if (!config.isProduction) return;

  const checks = [
    {
      name: 'JWT_ACCESS_SECRET',
      value: env.JWT_ACCESS_SECRET,
      placeholder: DEV_ONLY_JWT_ACCESS_SECRET,
      consequence:
        'every access token this process signs or verifies is only as ' +
        'secure as this value — a known/missing secret is a full ' +
        'authentication bypass (anyone who has ever seen this ' +
        'repository can forge a valid token for any user, any role)',
    },
    {
      name: 'JWT_REFRESH_SECRET',
      value: env.JWT_REFRESH_SECRET,
      placeholder: DEV_ONLY_JWT_REFRESH_SECRET,
      consequence:
        'every refresh token this process signs or verifies is only as ' +
        'secure as this value — the same full-authentication-bypass ' +
        'risk described above, for refresh tokens',
    },
    {
      name: 'CONNECTOR_CONFIG_ENCRYPTION_KEY',
      value: env.CONNECTOR_CONFIG_ENCRYPTION_KEY,
      placeholder: DEV_ONLY_CONNECTOR_CONFIG_ENCRYPTION_KEY,
      consequence:
        'every partner iCal/PMS/OTA connector credential this process ' +
        'encrypts at rest is only as protected as this key — a known/' +
        'missing key is equivalent to storing them in plaintext',
    },
  ].filter(({ value, placeholder }) => !value || value === placeholder);

  if (checks.length > 0) {
    const details = checks
      .map(({ name, consequence }) => `  - ${name}: ${consequence}.`)
      .join('\n');
    throw new Error(
      `Refusing to start: NODE_ENV=production but the following ` +
        `secret(s) are missing or still set to their known development ` +
        `placeholder value. Set a real, unique value for each in your ` +
        `production environment before starting this process:\n${details}`,
    );
  }
}

assertProductionSecretsAreConfigured();

export default config;
