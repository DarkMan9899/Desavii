# Payments: PAUSED / FUTURE ACTIVATION

**Status as of 2026-08-30: payment activation is paused for approximately
one year. `PAYMENTS_ENABLED` must remain `false` in every environment until
the activation work in this document is completed and explicitly
re-approved.**

This is not a rollback. The Stripe implementation described below is
complete and stays in the codebase, along with its test suite. Nothing was
removed. The marketplace launches and operates normally with payments off;
no Stripe credentials are required for normal site startup while
`PAYMENTS_ENABLED=false`.

---

## 1. What is already implemented

**Backend** (`apps/api/src/modules/payments/`)

- `PaymentProviderRegistry` — constructs `StripePaymentProvider` always,
  and `LocalPaymentProvider` only when `NODE_ENV !== 'production'`.
  `LocalPaymentProvider` is never even instantiated in a production
  process, regardless of configuration — see
  [paymentProviderRegistry.js](../apps/api/src/modules/payments/providers/paymentProviderRegistry.js).
  `#assertSafeForProduction()` additionally refuses to boot in production
  if `PAYMENT_DEFAULT_PROVIDER` resolves to `local`, or if
  `PAYMENTS_ENABLED=true` with an unconfigured/incomplete provider.
- `PaymentService` — full manual-capture lifecycle: `createPaymentIntent`
  (capture_method: manual), authorize → vendor accept → capture, vendor
  reject/cancel → void, full refund flow, webhook dispatch with signature
  verification and idempotent duplicate-event handling, an
  async-authorization race guard (`#syncPaymentWithBookingDecision`) for
  when a webhook authorizes a payment after the booking was already
  decided.
- `#assertPaymentsEnabled()` — a runtime gate (503 `PAYMENTS_DISABLED`) on
  `createPaymentIntent`/`createRefund`, independent of the boot-time
  registry guard. Payments-disabled is enforced at both boot and every
  call, not just cosmetically.
- `simulateScenario` — a `LocalPaymentProvider`-only demo control.
  Structurally rejected (422 `NOT_SUPPORTED_BY_PROVIDER`) if sent while any
  non-local provider is active, and never included in the metadata
  forwarded to a real provider. Cannot reach Stripe under any input.
- `GET /payments/config` — exposes `{enabled, provider,
  stripe_publishable_key?}` for the frontend; never exposes the secret key
  or webhook secret.
- `client_secret` handling — never persisted to the database; attached to
  the direct API response, and re-fetched on demand
  (`#resolveClientSecretForResume`) to support page-reload/resume without
  creating a duplicate PaymentIntent.

**Frontend** (`apps/web/src/modules/payments/`)

- `getStripe.js` — lazily loads `@stripe/stripe-js`, only once a
  `client_secret` actually exists (never initializes Stripe.js
  speculatively).
- `StripeCheckoutPanel` / `StripeConfirmForm` — button-first checkout flow:
  Pay Now → create PaymentIntent (bookingId only, no amount/currency sent
  by the client) → mount Stripe Elements → `confirmPayment` with
  `redirect: 'if_required'` → inline success/error/retry handling.
- Redirect-return recovery — a dedicated effect detects
  `payment_intent_client_secret` in the URL after an SCA/3DS redirect and
  resumes the flow independently of the checkout component's own state.
- `BookingPaymentSection` — reads `GET /payments/config` and renders
  nothing (never a wrong or stale checkout UI) while that config is
  pending/erroring, a disabled notice when payments are off, a config-error
  notice if Stripe is selected but misconfigured, `StripeCheckoutPanel`
  when Stripe is active, or the Local-only `PayNowPanel` otherwise.
  `PayNowPanel` is demo/dev tooling and is never reachable in production
  (Local is never registered there).

**Configuration** (`apps/api/src/config/index.js`)

- `PAYMENTS_ENABLED` (envalid `bool`, `default: false`, `devDefault: true`)
  — production's safe default is off; local `.env` now sets it explicitly
  to `false` (see §6) so this launch does not rely on the dev default.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`,
  `STRIPE_API_VERSION`, `PAYMENT_DEFAULT_PROVIDER` — all default to
  empty/`local`, so the app boots with zero Stripe configuration present.

## 2. What was verified

- **Unit tests**: 76/76 suites, 517/517 tests passing, covering the
  service-layer logic above (registry safety guards, provider-result
  application, `simulateScenario` isolation, etc.) and the frontend
  components (lazy Stripe init gating, confirm-form success/error/retry,
  redirect-return recovery, config-driven UI branching) with
  `@stripe/react-stripe-js` mocked.
- **Integration tests** (`apps/api/tests/integration/payments/`,
  `.../bookings/`): 9/9 suites, 109/109 tests passing. This includes
  `stripeManualCaptureFlow.test.js`, which mocks only Node's global
  `fetch` at the network boundary (never `StripePaymentProvider` itself)
  and computes genuinely valid HMAC-SHA256 webhook signatures — exercising
  the real application code for: config exposure, PaymentIntent creation +
  client_secret, resume-on-reload, confirm→capture, reject→void, two
  async-authorization-race scenarios, duplicate-webhook idempotency,
  tampered-signature rejection, and both `simulateScenario` isolation
  checks.
- **`PAYMENTS_ENABLED=false` gate**: a dedicated integration test
  (`paymentsDisabledGate.test.js`) plus a real backend+browser check
  confirmed `GET /payments/config` reports disabled, `POST /payments` and
  `POST /payments/:id/refunds` both return 503, and the booking page
  renders a disabled notice with no actionable payment control.
- The 16 pre-existing backend integration-suite failures and 26
  pre-existing Playwright E2E failures elsewhere in the codebase were
  root-caused and confirmed unrelated to payments (rate-limit contention
  and stale test fixtures for the former; a missing prerender-build step
  and parallel-run resource contention for the latter) via repeated
  before/after comparison runs.

## 3. What remains unverified

**No live round-trip against a real Stripe account has ever been
completed.** Specifically, none of the following has been exercised
end-to-end against Stripe's real test-mode API:

- Stripe Elements / Payment Element actually loading in a real browser
  against a real publishable key.
- A real `confirmPayment()` call and a real SCA/3DS test-card challenge.
- Real webhook delivery from Stripe's own servers (only a locally-computed
  HMAC signature was tested, not Stripe's actual delivery pipeline).
- Real capture, void, full refund, or partial refund calls against
  Stripe's actual API.

This session installed the Stripe CLI and authenticated it to a real
Stripe test-mode sandbox account ("LearnIT LLC sandbox",
`acct_1RX0XWP3MXxRddoj`) in order to run this verification, but stopped
before it could complete: Stripe does not re-expose a full secret-key
value through any CLI or API call once a key exists (by Stripe's own
design), so a human had to retrieve `STRIPE_SECRET_KEY`/
`STRIPE_PUBLISHABLE_KEY` from the Dashboard directly. That step never
happened before this pause was requested. No secret value was ever
printed, logged, persisted, or committed at any point. The CLI session has
since been logged out (`stripe logout`) as part of this pause.

## 4. What must be done before enabling payments in the future

1. Obtain `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, and (once webhook
   forwarding/endpoint is set up) `STRIPE_WEBHOOK_SECRET` from the Stripe
   Dashboard for the account that will actually process payments.
2. Complete the live Stripe test-mode verification that never ran (§3, in
   full) against a real test-mode account: Elements loading, PaymentIntent
   creation, `confirmPayment`, SCA/3DS, authorize→capture, authorize→void,
   full refund, partial refund, real webhook signature verification,
   duplicate-event idempotency, and refresh/redirect-return recovery.
3. Re-run the full unit + integration + payments/bookings + E2E
   (`payments.spec.js`) suites at that time — a ~1 year gap is long enough
   that dependency or platform drift elsewhere in the codebase could have
   introduced an unrelated regression since 2026-08-30.
4. Confirm `STRIPE_API_VERSION` (currently pinned to `2024-06-20`) is
   still a supported Stripe API version; Stripe deprecates old API
   versions on its own schedule, and a year-long pause makes this a
   concrete, not hypothetical, risk. Update the pin and re-verify if not.
5. Check `@stripe/stripe-js` and `@stripe/react-stripe-js` for breaking
   changes released during the pause and upgrade if needed.
6. Confirm production secrets will be supplied via the deployment
   platform's secret manager, never a committed or shared `.env` file.
7. Only after 1–6 pass: set `PAYMENTS_ENABLED=true` and
   `PAYMENT_DEFAULT_PROVIDER=stripe` in the target environment.

## 5. Required Stripe environment variables for future activation

All backend-only (`apps/api`); none of these are ever read by the
frontend build — the frontend receives only the publishable key at
runtime via `GET /payments/config`.

| Variable | Purpose |
|---|---|
| `PAYMENTS_ENABLED` | Master go-live switch. Must be `true` to activate. |
| `PAYMENT_DEFAULT_PROVIDER` | Must be `stripe` (never `local`) for any real activation. |
| `STRIPE_SECRET_KEY` | Backend-only. Never exposed to the frontend. |
| `STRIPE_PUBLISHABLE_KEY` | The only Stripe value ever safe to reach the browser. |
| `STRIPE_WEBHOOK_SECRET` | Verifies inbound Stripe webhook signatures. |
| `STRIPE_API_VERSION` | Currently `2024-06-20` — reconfirm before activation (§4.4). |

## 6. Current enforced state

`apps/api/.env` now sets `PAYMENTS_ENABLED=false` explicitly (previously
unset, which would have silently fallen back to envalid's
`devDefault: true` in local development). No `STRIPE_*` variable is set in
any environment file on this machine.

**Restaurant reservations never take platform payment (Step L6.2H2B).** A
restaurant reservation is free (its listing price is average spend per person,
display only). Every booking carries a server-computed `payment_required`
flag, and `PaymentService#createPaymentIntent` refuses a booking that does not
require payment with `409 PAYMENT_NOT_REQUIRED` — before any payment row,
booking payment-status change or provider call — so this holds even once
payments are enabled.

**`PAYMENTS_ENABLED` must remain `false` in every environment — local,
staging, and production — until the activation work in §4 is completed
and explicitly re-approved.** No further payment-system development,
Stripe CLI/credential work, or payment E2E verification will proceed until
that approval.
