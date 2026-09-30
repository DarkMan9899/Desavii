/**
 * PaymentService — the single gateway for the Payments module (Phase 16).
 *
 * Owns Payment creation, provider-result application, and Refunds — both
 * live in this one Service because a refund always mutates the SAME
 * `payments` row (its `refunded_amount` rollup + status) inside the SAME
 * transaction as the new `refunds` row, so splitting them into two
 * services would only add indirection without a real seam (they share one
 * aggregate). Ledger reads are a separate, independent concern —
 * `ledgerService.js` owns those.
 *
 * CRITICAL invariant (Phase 16 spec §7): payment truth is established
 * HERE, from the provider's response or a verified webhook — never from
 * a client-supplied "it succeeded" claim. `bookingService.recordPaymentOutcome`
 * is only ever called with a status this Service itself resolved.
 */

import { createHash } from 'node:crypto';
import config from '../../../config/index.js';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  ValidationError,
  NotFoundError,
  ServiceUnavailableError,
} from '../../../errors/AppError.js';
import { isPartnerOwner } from '../../../infrastructure/database/repositories/partnerEmployeeRepository.js';
import { findCurrencyByCode } from '../../../infrastructure/database/repositories/currencyRepository.js';
import { withTransaction } from '../../../infrastructure/database/transaction.js';
import { Money } from '../../../core/domain/money.js';
import { isBookingPaymentRequired } from '../../../core/domain/bookingPaymentRequirement.js';
import {
  generatePaymentReference,
  generateRefundReference,
} from '../../../core/domain/bookingReference.js';
import { isValidPaymentStatusTransition } from '../../../core/domain/paymentStatusTransitions.js';
import { isValidRefundStatusTransition } from '../../../core/domain/refundStatusTransitions.js';
import { createNoOpEventBus } from '../../../core/events/domainEventBus.js';
import { createDomainEvent } from '../../../core/events/createDomainEvent.js';
import { EVENT_TYPES } from '../../../core/events/eventTypes.js';
import { getModuleLogger } from '../../../logging/logger.js';

const log = getModuleLogger('payments');

const VIEW_PERMISSION = 'payment.view';
const REFUND_PERMISSION = 'payment.refund';

// Payment intent status -> the coarse, booking-facing payment_statuses
// code (migration 0008's lookup, extended in seed 011).
const BOOKING_PAYMENT_STATUS_BY_INTENT_STATUS = Object.freeze({
  CREATED: 'AWAITING_PAYMENT',
  REQUIRES_ACTION: 'AWAITING_PAYMENT',
  PROCESSING: 'AWAITING_PAYMENT',
  // Manual-capture booking payment flow: the customer has authorized
  // funds at checkout, but nothing is captured until the vendor accepts
  // the booking (`BookingService#confirmBooking`/`#capturePaymentForConfirmedBooking`).
  AUTHORIZED: 'AUTHORIZED_AWAITING_CAPTURE',
  SUCCEEDED: 'PAID_ONLINE',
  FAILED: 'PAYMENT_FAILED',
  // The authorization was voided (vendor rejected, or the customer/vendor
  // cancelled) before ever being captured — never charged, distinct from
  // a genuinely failed/declined attempt.
  CANCELLED: 'PAYMENT_VOIDED',
});

const PAYABLE_BOOKING_STATUSES = Object.freeze(['PENDING_VENDOR', 'CONFIRMED']);

export class PaymentService {
  #paymentRepository;

  #refundRepository;

  #providerEventRepository;

  #ledgerRepository;

  #providerRegistry;

  #bookingService;

  #permissionResolver;

  #auditLogger;

  #eventBus;

  #settlementScheduler;

  constructor({
    paymentRepository,
    refundRepository,
    providerEventRepository,
    ledgerRepository,
    providerRegistry,
    bookingService,
    permissionResolver,
    auditLogger,
    eventBus = createNoOpEventBus(),
    // Optional: `(paymentId) => void` — schedules the delayed local-
    // settlement job. Defaults to a no-op so unit tests (and any provider
    // that never resolves to PROCESSING) never need to supply one.
    settlementScheduler = () => {},
  }) {
    this.#paymentRepository = paymentRepository;
    this.#refundRepository = refundRepository;
    this.#providerEventRepository = providerEventRepository;
    this.#ledgerRepository = ledgerRepository;
    this.#providerRegistry = providerRegistry;
    this.#bookingService = bookingService;
    this.#permissionResolver = permissionResolver;
    this.#auditLogger = auditLogger;
    this.#eventBus = eventBus;
    this.#settlementScheduler = settlementScheduler;
  }

  /**
   * Go-live sequencing gate: the marketplace launches before real payments
   * are switched on (`config.payments.enabled`, off by default in every
   * environment — see config/index.js). Called at the top of every
   * customer/admin-initiated payment ACTION (creating a new payment,
   * issuing an admin refund) so "payments disabled" is an actual runtime
   * guarantee, not merely a boot-time provider check. Deliberately NOT
   * called by `issueSystemRefund`/`handleProviderWebhook`, which only ever
   * settle a payment that already exists from when payments WERE enabled
   * — blocking those would strand a customer's already-captured money.
   */
  #assertPaymentsEnabled() {
    if (!config.payments.enabled) {
      throw new ServiceUnavailableError(
        'Online payments are not yet enabled on this marketplace.',
        'PAYMENTS_DISABLED',
      );
    }
  }

  async #isOwnerOrHasPermission(principal, partnerId, permissionKey) {
    if (!principal) return false;
    const isOwner = await isPartnerOwner(principal.userId, partnerId);
    if (isOwner) return true;
    return this.#permissionResolver.hasPermission(
      principal.roles,
      permissionKey,
    );
  }

  async #assertOwnerOrPermission(principal, partnerId, permissionKey) {
    if (!principal) throw new AuthenticationError();
    const allowed = await this.#isOwnerOrHasPermission(
      principal,
      partnerId,
      permissionKey,
    );
    if (!allowed) throw new AuthorizationError();
  }

  async #hydrate(payment, connection) {
    const [attempts, transactions, refunds] = await Promise.all([
      this.#paymentRepository.listAttemptsForPayment(payment.id, connection),
      this.#paymentRepository.listTransactionsForPayment(
        payment.id,
        connection,
      ),
      this.#refundRepository.listForPayment(payment.id, connection),
    ]);
    return { ...payment, attempts, transactions, refunds };
  }

  /**
   * Applies a provider's resolved outcome to a locked payment row —
   * shared by the synchronous path (`createPaymentIntent`) and the
   * asynchronous webhook path (`handleProviderWebhook`), so both go
   * through IDENTICAL status-transition validation, booking integration,
   * and ledger writes. `payment` must already be row-locked by the caller
   * (`FOR UPDATE`) within `connection`'s transaction.
   */
  async #applyProviderResult(
    payment,
    { status, providerPaymentId, failureCode, failureMessage },
    { actorId, connection },
  ) {
    const isSameStatus = status === payment.statusCode;
    const providerPaymentIdUnchanged =
      providerPaymentId === undefined ||
      providerPaymentId === payment.providerPaymentId;
    if (isSameStatus && providerPaymentIdUnchanged) {
      // Idempotent no-op — the same outcome was already applied (e.g. a
      // redelivered webhook after this app already processed it once).
      return payment;
    }
    // Stripe go-live preflight fix: a same-status application with a NEW
    // `providerPaymentId` is not a real state transition — Stripe's
    // initial synchronous creation response
    // (`requires_payment_method`/`requires_confirmation`) maps to this
    // app's own `CREATED`, the exact placeholder status
    // `createPaymentIntent`'s TX-1 already persisted the row with. Only
    // validate transition legality when the status is ACTUALLY changing;
    // `isValidPaymentStatusTransition` has no "stay at the same status"
    // entry for any status (nor should it — that's not a transition),
    // so calling it unconditionally here would wrongly reject this
    // genuine first application as `CREATED -> CREATED`. This never
    // surfaced with `LocalPaymentProvider`, whose every scenario resolves
    // synchronously to a status DIFFERENT from `CREATED`.
    if (
      !isSameStatus &&
      !isValidPaymentStatusTransition(payment.statusCode, status)
    ) {
      throw new ConflictError(
        `Cannot transition a payment from ${payment.statusCode} to ${status}.`,
        'INVALID_PAYMENT_TRANSITION',
      );
    }

    const statusId = await this.#paymentRepository.findIntentStatusIdByCode(
      status,
      connection,
    );
    const now = new Date();
    const isSucceeded = status === 'SUCCEEDED';
    await this.#paymentRepository.updateStatus(
      payment.id,
      {
        statusId,
        ...(providerPaymentId !== undefined ? { providerPaymentId } : {}),
        ...(isSucceeded ? { capturedAmount: payment.totalAmount } : {}),
        ...(failureCode !== undefined ? { failureCode } : {}),
        ...(failureMessage !== undefined ? { failureMessage } : {}),
        ...(status === 'AUTHORIZED' ? { authorizedAt: now } : {}),
        ...(isSucceeded ? { succeededAt: now } : {}),
        ...(status === 'FAILED' ? { failedAt: now } : {}),
        ...(status === 'CANCELLED' ? { cancelledAt: now } : {}),
      },
      connection,
    );

    const transactionTypeByStatus = {
      AUTHORIZED: 'PAYMENT_AUTHORIZED',
      SUCCEEDED: 'PAYMENT_CAPTURED',
      FAILED: 'PAYMENT_FAILED',
      CANCELLED: 'PAYMENT_CANCELLED',
    };
    if (transactionTypeByStatus[status]) {
      await this.#paymentRepository.createTransaction(
        {
          paymentId: payment.id,
          type: transactionTypeByStatus[status],
          amount: isSucceeded ? payment.totalAmount : null,
          currencyId: isSucceeded
            ? (await findCurrencyByCode(payment.currencyCode, connection)).id
            : null,
          actorId: actorId ?? null,
          metadata: failureCode ? { failureCode, failureMessage } : null,
        },
        connection,
      );
    }

    const bookingPaymentStatus =
      BOOKING_PAYMENT_STATUS_BY_INTENT_STATUS[status];
    if (bookingPaymentStatus) {
      await this.#bookingService.recordPaymentOutcome(
        payment.bookingId,
        bookingPaymentStatus,
        { connection },
      );
    }

    if (isSucceeded) {
      const currency = await findCurrencyByCode(
        payment.currencyCode,
        connection,
      );
      await this.#ledgerRepository.create(
        {
          entryType: 'CUSTOMER_PAYMENT_RECEIVED',
          paymentId: payment.id,
          bookingId: payment.bookingId,
          partnerId: null,
          amount: payment.totalAmount,
          currencyId: currency.id,
          description: `Payment received for booking #${payment.bookingId}`,
        },
        connection,
      );
      // No commission/fee engine exists anywhere in this codebase yet
      // (documented limitation) — the partner is accrued the full
      // payment amount as payable, honestly matching what actually
      // happened rather than fabricating a platform-fee split.
      await this.#ledgerRepository.create(
        {
          entryType: 'PARTNER_PAYABLE_ACCRUED',
          paymentId: payment.id,
          bookingId: payment.bookingId,
          partnerId: payment.partnerId,
          amount: payment.totalAmount,
          currencyId: currency.id,
          description: `Payable accrued for booking #${payment.bookingId}`,
        },
        connection,
      );
    }

    return this.#paymentRepository.findById(payment.id, connection);
  }

  /**
   * Creates a new Payment for a booking. Idempotent: a repeated call with
   * the same `idempotencyKey` returns the original payment rather than
   * creating a second one; at most one non-terminal payment may exist per
   * booking at a time (enforced under a row lock — see
   * `mysqlPaymentRepository#findActiveForBooking`).
   *
   * Stripe go-live preflight fix: previously ran entirely inside ONE
   * transaction, including the provider's `createPaymentIntent` network
   * call — directly violating `transaction.js`'s own documented rule
   * ("a transaction is never held open across an external network
   * call"). Inert with `LocalPaymentProvider` (in-process, no real
   * latency), but with a real provider this held a DB transaction open
   * for the full request/retry/timeout window. Now split into two short
   * transactions with the provider call sandwiched between them, holding
   * no lock during it: TX-1 validates + persists the row as `CREATED`
   * (`findActiveForBooking`'s own `FOR UPDATE` is what keeps the
   * "at most one active payment per booking" guarantee, and treats
   * `CREATED` as active, so a concurrent second request's TX-1 correctly
   * sees this row and is rejected before ever calling the provider);
   * then the provider call runs with no transaction open; then TX-2
   * re-locks the row by id and applies the result. If the provider call
   * itself throws (network/timeout — not a synchronous decline, which is
   * a normal `providerResult`), the row is resolved to `FAILED` in its
   * own short transaction rather than left stuck in `CREATED` forever
   * (which `findActiveForBooking` would otherwise treat as permanently
   * blocking any further payment attempt on this booking).
   */
  async createPaymentIntent(
    principal,
    bookingId,
    { idempotencyKey, simulateScenario, metadata = {} } = {},
  ) {
    if (!principal) throw new AuthenticationError();
    this.#assertPaymentsEnabled();

    if (idempotencyKey) {
      const existing =
        await this.#paymentRepository.findByIdempotencyKey(idempotencyKey);
      if (existing) return this.#hydrate(existing);
    }

    const booking = await this.#bookingService.getBooking(principal, bookingId);
    if (booking.customerUserId !== principal.userId) {
      throw new AuthorizationError();
    }
    // Step L6.2H2B: a restaurant reservation (or any zero-total booking)
    // never takes platform payment — refused before any payment row,
    // booking payment-status change or provider call.
    if (!isBookingPaymentRequired(booking)) {
      throw new ConflictError(
        'This booking does not require an online payment.',
        'PAYMENT_NOT_REQUIRED',
      );
    }
    if (!PAYABLE_BOOKING_STATUSES.includes(booking.statusCode)) {
      throw new ConflictError(
        'This booking cannot accept a payment in its current state.',
        'BOOKING_NOT_PAYABLE',
      );
    }

    const provider = this.#providerRegistry.getDefaultProvider();
    // Release-architecture requirement: no demo/simulation control may be
    // part of the real Stripe (or any non-`local`) request contract.
    // `simulateScenario` only ever means anything to `LocalPaymentProvider`
    // — Layer 2 (paymentValidators.js) is shape-only and has no business-
    // rule access to "which provider is active," so THIS is where it's
    // actually enforced: a caller sending this field against any other
    // provider is refused outright, never silently ignored, before this
    // request ever touches the database or the provider adapter.
    if (provider.code !== 'local' && simulateScenario !== undefined) {
      throw new ValidationError(
        'simulateScenario is only supported by the local development ' +
          'payment provider and cannot be used with the active payment ' +
          'provider.',
        [{ field: 'simulateScenario', issue: 'NOT_SUPPORTED_BY_PROVIDER' }],
      );
    }

    // TX-1 — validate + persist the row as CREATED. No provider call here.
    const created = await withTransaction(async (connection) => {
      const active = await this.#paymentRepository.findActiveForBooking(
        bookingId,
        connection,
      );
      if (active.length > 0) {
        throw new ConflictError(
          'A payment is already in progress for this booking.',
          'PAYMENT_ALREADY_ACTIVE',
        );
      }

      const currency = await findCurrencyByCode(
        booking.currencyCode,
        connection,
      );
      const createdStatusId =
        await this.#paymentRepository.findIntentStatusIdByCode(
          'CREATED',
          connection,
        );

      const payment = await this.#paymentRepository.create(
        {
          paymentReference: generatePaymentReference(),
          bookingId: booking.id,
          customerUserId: booking.customerUserId,
          partnerId: booking.partnerId,
          providerCode: provider.code,
          statusId: createdStatusId,
          baseAmount: booking.subtotalAmount,
          feesAmount: booking.feesAmount,
          taxAmount: '0.00',
          discountAmount: booking.discountAmount,
          totalAmount: booking.totalAmount,
          currencyId: currency.id,
          idempotencyKey: idempotencyKey ?? null,
          // Release-architecture requirement: `simulateScenario` never
          // reaches a real provider's request at all — not even a
          // defaulted `'SUCCESS'` value — so nothing demo/simulation-
          // related is ever part of what's actually sent to Stripe. Local
          // behavior is unchanged (still defaults to `'SUCCESS'` when
          // omitted).
          metadata: {
            ...metadata,
            ...(provider.code === 'local'
              ? { simulateScenario: simulateScenario ?? 'SUCCESS' }
              : {}),
          },
          createdBy: principal.userId,
        },
        connection,
      );

      await this.#paymentRepository.createTransaction(
        {
          paymentId: payment.id,
          type: 'PAYMENT_CREATED',
          amount: payment.totalAmount,
          currencyId: currency.id,
          actorId: principal.userId,
        },
        connection,
      );
      await this.#bookingService.recordPaymentOutcome(
        booking.id,
        'AWAITING_PAYMENT',
        { connection },
      );

      return payment;
    });

    // Provider network call — deliberately OUTSIDE any open transaction/lock.
    let providerResult;
    try {
      providerResult = await provider.createPaymentIntent({
        amount: created.totalAmount,
        currencyCode: created.currencyCode,
        paymentReference: created.paymentReference,
        bookingId: booking.id,
        metadata: created.metadata,
      });
    } catch (err) {
      const failed = await withTransaction(async (connection) => {
        const locked = await this.#paymentRepository.lockById(
          created.id,
          connection,
        );
        return this.#applyProviderResult(
          locked,
          {
            status: 'FAILED',
            failureCode: 'provider_unreachable',
            failureMessage: err.message,
          },
          { actorId: principal.userId, connection },
        );
      });
      await this.#publishOutcomeEvent(failed, principal.userId);
      throw err;
    }

    // TX-2 — re-lock the already-persisted row and apply the result.
    const result = await withTransaction(async (connection) => {
      const locked = await this.#paymentRepository.lockById(
        created.id,
        connection,
      );

      await this.#paymentRepository.createAttempt(
        {
          paymentId: locked.id,
          attemptNumber: 1,
          providerCode: provider.code,
          statusId: await this.#paymentRepository.findIntentStatusIdByCode(
            providerResult.status,
            connection,
          ),
          failureCode: providerResult.failureCode,
          failureMessage: providerResult.failureMessage,
          rawProviderResponse: providerResult.raw,
        },
        connection,
      );

      const applied = await this.#applyProviderResult(locked, providerResult, {
        actorId: principal.userId,
        connection,
      });

      await this.#auditLogger.record(
        {
          actorId: principal.userId,
          action: 'payment.created',
          targetType: 'payment',
          targetId: applied.id,
          afterSnapshot: {
            bookingId: booking.id,
            totalAmount: applied.totalAmount,
            status: applied.statusCode,
          },
        },
        connection,
      );

      return this.#hydrate(applied, connection);
    });
    // Stripe Elements checkout flow: the ONE thing the frontend needs to
    // call `stripe.confirmPayment` — never persisted (see
    // `paymentDto.js`'s header comment), so it's attached here, once, on
    // the direct response to this call. `LocalPaymentProvider` never
    // returns one (`providerResult.clientSecret` is `undefined`), so this
    // is simply `null` for every non-Stripe payment.
    result.clientSecret = providerResult.clientSecret ?? null;

    await this.#eventBus.publish(
      createDomainEvent({
        eventType: EVENT_TYPES.PAYMENT_CREATED,
        actorId: principal.userId,
        resourceType: 'payment',
        resourceId: result.id,
        payload: {
          paymentReference: result.paymentReference,
          bookingId: result.bookingId,
          partnerId: result.partnerId,
          customerUserId: result.customerUserId,
          totalAmount: result.totalAmount,
          currency: result.currencyCode,
        },
      }),
    );
    await this.#publishOutcomeEvent(result, principal.userId);

    if (result.statusCode === 'PROCESSING') {
      this.#settlementScheduler(result.id);
    }

    // Manual-capture booking payment flow: `PAYABLE_BOOKING_STATUSES`
    // allows paying a booking that is ALREADY `CONFIRMED` (the vendor
    // accepted before the customer finished checkout) — in that case
    // there is no future `BookingService#confirmBooking` transition left
    // to trigger a capture, so an authorization against an already-
    // CONFIRMED booking is captured immediately, synchronously, as part
    // of this same request. A capture failure here never turns an
    // otherwise-successful checkout into an apparent failure — the
    // customer's card WAS successfully authorized; the payment simply
    // stays AUTHORIZED (safe, recoverable) and this is logged for
    // operational follow-up, exactly like `BookingService
    // #capturePaymentForConfirmedBooking`'s identical failure handling.
    if (
      result.statusCode === 'AUTHORIZED' &&
      booking.statusCode === 'CONFIRMED'
    ) {
      try {
        const captured = await this.#executeCaptureOrVoid(result.id, 'capture');
        return this.#hydrate(captured);
      } catch (err) {
        log.error(
          { err, paymentId: result.id, bookingId: booking.id },
          'Immediate payment capture failed for an already-CONFIRMED booking',
        );
      }
    }

    return result;
  }

  async #publishOutcomeEvent(payment, actorId) {
    const eventTypeByStatus = {
      PROCESSING: EVENT_TYPES.PAYMENT_PROCESSING,
      SUCCEEDED: EVENT_TYPES.PAYMENT_SUCCEEDED,
      FAILED: EVENT_TYPES.PAYMENT_FAILED,
      CANCELLED: EVENT_TYPES.PAYMENT_CANCELLED,
    };
    const eventType = eventTypeByStatus[payment.statusCode];
    if (!eventType) return;
    await this.#eventBus.publish(
      createDomainEvent({
        eventType,
        actorId: actorId ?? null,
        resourceType: 'payment',
        resourceId: payment.id,
        payload: {
          paymentReference: payment.paymentReference,
          bookingId: payment.bookingId,
          partnerId: payment.partnerId,
          customerUserId: payment.customerUserId,
          totalAmount: payment.totalAmount,
          currency: payment.currencyCode,
          failureCode: payment.failureCode ?? null,
        },
      }),
    );
  }

  /**
   * Applies a normalized provider webhook event to the payment or refund
   * it references. This is the ONLY entry point for asynchronous
   * provider truth — `LocalPaymentProvider`'s simulated
   * `PROCESSING -> SUCCEEDED` settlement (see
   * `jobs/localProviderSettlementQueue.js`) goes through this exact same
   * path, so the real-provider code and the demo path are genuinely the
   * same code, not a parallel shortcut.
   *
   * Duplicate delivery is a safe no-op: `payment_provider_events`'
   * `UNIQUE(provider_code, provider_event_id)` constraint rejects a
   * redelivered event before any financial state is touched twice.
   *
   * Stripe go-live preflight fix: previously assumed every event was a
   * payment-status change and could resolve an unmapped/unrecognized
   * status to `null`, which `isValidPaymentStatusTransition` then threw
   * a bare (non-`AppError`) `TypeError` on — an uncaught 500, not a
   * clean, logged failure. Now dispatches on the provider's own
   * `normalized.kind` (`'payment'` / `'refund'` / `'unhandled'`, see
   * `StripePaymentProvider#normalizeWebhookEvent`) to the correct
   * table/vocabulary, and an unmapped status for a kind this app DOES
   * act on is recorded as a failed event (webhook still ACKs 200 — no
   * retry can fix an app that doesn't understand the status it
   * received) instead of throwing.
   */
  async handleProviderWebhook(
    providerCode,
    { rawBody, signatureHeader, parsedEvent },
  ) {
    const provider = this.#providerRegistry.getProvider(providerCode);
    const verified = await provider.verifyWebhook({ rawBody, signatureHeader });
    if (!verified) {
      throw new ValidationError('Invalid webhook signature.');
    }

    const normalized = provider.normalizeWebhookEvent(parsedEvent);

    let eventRow;
    try {
      eventRow = await this.#providerEventRepository.create({
        providerCode,
        providerEventId: normalized.providerEventId,
        eventType: normalized.eventType,
        normalizedEventType: normalized.normalizedEventType,
        payload: parsedEvent,
      });
    } catch (err) {
      if (err.code === 'CONFLICT') {
        return { duplicate: true };
      }
      throw err;
    }

    if (normalized.kind === 'refund') {
      const refund = await this.#applyRefundWebhookEvent(
        providerCode,
        normalized,
        eventRow,
      );
      return { duplicate: false, payment: null, refund };
    }

    if (normalized.kind !== 'payment') {
      // An event type this app doesn't act on (yet) — ack it cleanly
      // without touching any financial state, rather than misrouting it
      // into the payment-status branch below.
      await this.#providerEventRepository.markProcessed(eventRow.id);
      return { duplicate: false, payment: null };
    }

    const result = await withTransaction(async (connection) => {
      if (!normalized.status) {
        await this.#providerEventRepository.markFailed(
          eventRow.id,
          `Unrecognized/unmapped payment status for event type "${normalized.eventType}".`,
          connection,
        );
        return null;
      }

      const payment = await this.#paymentRepository.lockByProviderPaymentId(
        providerCode,
        normalized.providerPaymentId,
        connection,
      );
      if (!payment) {
        await this.#providerEventRepository.markFailed(
          eventRow.id,
          'No payment found for this provider_payment_id.',
          connection,
        );
        return null;
      }

      const updated = await this.#applyProviderResult(
        payment,
        {
          status: normalized.status,
          providerPaymentId: normalized.providerPaymentId,
          failureCode: normalized.failureCode,
          failureMessage: normalized.failureMessage,
        },
        { actorId: null, connection },
      );
      await this.#providerEventRepository.markProcessed(
        eventRow.id,
        connection,
      );
      return updated;
    });

    if (result) {
      await this.#publishOutcomeEvent(result, null);
      if (result.statusCode === 'AUTHORIZED') {
        await this.#syncPaymentWithBookingDecision(result);
      }
    }
    return { duplicate: false, payment: result };
  }

  /**
   * Manual-capture booking payment flow, async-authorization case: the
   * customer's 3DS/SCA confirmation can complete well after checkout (a
   * real redirect-based challenge, or simply a slow customer) — by the
   * time Stripe's webhook lands here with `AUTHORIZED`, the vendor may
   * have ALREADY confirmed or rejected the booking in the meantime.
   * `createPaymentIntent`'s own "already-CONFIRMED" branch only covers
   * the synchronous case (an already-CONFIRMED booking at the moment of
   * authorization); this covers the same decision arriving on either
   * side of an asynchronous authorization instead. A capture/void failure
   * here is logged, never thrown — this runs from a webhook handler that
   * must still ack the delivery.
   */
  async #syncPaymentWithBookingDecision(payment) {
    const bookingStatus =
      await this.#bookingService.getBookingStatusSystemInternal(
        payment.bookingId,
      );
    const NON_PAYABLE_TERMINAL_STATUSES = [
      'REJECTED',
      'CANCELLED_BY_CUSTOMER',
      'CANCELLED_BY_VENDOR',
      'EXPIRED',
    ];
    if (bookingStatus === 'CONFIRMED') {
      try {
        const captured = await this.#executeCaptureOrVoid(
          payment.id,
          'capture',
        );
        await this.#publishOutcomeEvent(captured, null);
      } catch (err) {
        log.error(
          { err, paymentId: payment.id, bookingId: payment.bookingId },
          'Payment capture failed for a booking that was already CONFIRMED when authorization completed asynchronously',
        );
      }
      return;
    }
    if (NON_PAYABLE_TERMINAL_STATUSES.includes(bookingStatus)) {
      try {
        const voided = await this.#executeCaptureOrVoid(payment.id, 'void');
        await this.#publishOutcomeEvent(voided, null);
      } catch (err) {
        log.error(
          { err, paymentId: payment.id, bookingId: payment.bookingId },
          'Payment void failed for a booking that was already rejected/cancelled when authorization completed asynchronously',
        );
      }
    }
  }

  /**
   * Applies a `refund.*`/`charge.refunded` webhook event to the refund it
   * references — the async counterpart to `#executeRefund`'s own
   * synchronous result-application, sharing `#applyRefundResult` so both
   * paths finalize a refund identically (payment status rollup, manual-
   * review resolution, ledger entries, or reservation release on a
   * definitive failure).
   */
  async #applyRefundWebhookEvent(providerCode, normalized, eventRow) {
    if (!normalized.status || !normalized.providerRefundId) {
      await this.#providerEventRepository.markFailed(
        eventRow.id,
        `Unrecognized/unmapped refund event ("${normalized.eventType}") or missing provider_refund_id.`,
      );
      return null;
    }

    const result = await withTransaction(async (connection) => {
      const refund = await this.#refundRepository.lockByProviderRefundId(
        providerCode,
        normalized.providerRefundId,
        connection,
      );
      if (!refund) {
        await this.#providerEventRepository.markFailed(
          eventRow.id,
          'No refund found for this provider_refund_id.',
          connection,
        );
        return null;
      }
      const payment = await this.#paymentRepository.lockById(
        refund.paymentId,
        connection,
      );

      const updated = await this.#applyRefundResult(
        refund,
        payment,
        {
          status: normalized.status,
          providerRefundId: normalized.providerRefundId,
        },
        { actorId: null, connection },
      );
      await this.#providerEventRepository.markProcessed(
        eventRow.id,
        connection,
      );
      return updated;
    });

    if (result) {
      await this.#publishRefundOutcomeEvent(result);
    }
    return result;
  }

  /**
   * Applies a resolved refund outcome (`SUCCEEDED`/`FAILED`/`CANCELLED`,
   * or a no-op re-delivery of `PROCESSING`) to a refund row and its
   * owning payment — shared by `#executeRefund`'s synchronous TX-2 and
   * `#applyRefundWebhookEvent`'s asynchronous path, so a refund reaches
   * the exact same final state (payment rollup, manual-review
   * resolution, ledger entries) no matter which path resolved it.
   * `refund`/`payment` must already be row-locked by the caller within
   * `connection`'s transaction. The `refunded_amount` reservation this
   * refund made (`reserveRefundAmount`, at creation) is only ever
   * released here on a definitive `FAILED`/`CANCELLED` outcome — a
   * `PROCESSING` result leaves it reserved, pending a later webhook.
   */
  async #applyRefundResult(
    refund,
    payment,
    providerResult,
    { actorId, connection },
  ) {
    if (providerResult.status === refund.statusCode) {
      // Idempotent no-op — matches `#applyProviderResult`'s identical
      // guard for payments.
      return refund;
    }
    if (
      !isValidRefundStatusTransition(refund.statusCode, providerResult.status)
    ) {
      throw new ConflictError(
        `Cannot transition a refund from ${refund.statusCode} to ${providerResult.status}.`,
        'INVALID_REFUND_TRANSITION',
      );
    }

    const currency = await findCurrencyByCode(payment.currencyCode, connection);
    const resolvedRefundStatusId =
      await this.#refundRepository.findRefundStatusIdByCode(
        providerResult.status,
        connection,
      );
    const now = new Date();
    const isSucceeded = providerResult.status === 'SUCCEEDED';
    const isDefinitiveFailure = ['FAILED', 'CANCELLED'].includes(
      providerResult.status,
    );
    await this.#refundRepository.updateStatus(
      refund.id,
      {
        statusId: resolvedRefundStatusId,
        ...(providerResult.providerRefundId !== undefined
          ? { providerRefundId: providerResult.providerRefundId }
          : {}),
        failureCode: providerResult.failureCode,
        failureMessage: providerResult.failureMessage,
        ...(isSucceeded ? { succeededAt: now } : {}),
        ...(providerResult.status === 'FAILED' ? { failedAt: now } : {}),
      },
      connection,
    );
    const updatedRefund = await this.#refundRepository.findById(
      refund.id,
      connection,
    );

    await this.#paymentRepository.createTransaction(
      {
        paymentId: payment.id,
        refundId: updatedRefund.id,
        type: isSucceeded ? 'REFUND_SUCCEEDED' : 'REFUND_FAILED',
        amount: refund.amount,
        currencyId: currency.id,
        actorId,
        metadata: providerResult.failureCode
          ? { failureCode: providerResult.failureCode }
          : null,
      },
      connection,
    );

    if (isSucceeded) {
      // `refunded_amount` was already bumped by `reserveRefundAmount`
      // when this refund was created — re-read the payment row here
      // (inside this transaction) for the authoritative current total
      // rather than recomputing it from a possibly-stale caller value.
      const lockedPayment = await this.#paymentRepository.lockById(
        payment.id,
        connection,
      );
      const isFullyRefunded = Money.fromDecimalString(
        lockedPayment.refundedAmount,
        lockedPayment.currencyCode,
      ).equals(
        Money.fromDecimalString(
          lockedPayment.capturedAmount,
          lockedPayment.currencyCode,
        ),
      );
      const newPaymentStatus = isFullyRefunded
        ? 'REFUNDED'
        : 'PARTIALLY_REFUNDED';
      const newPaymentStatusId =
        await this.#paymentRepository.findIntentStatusIdByCode(
          newPaymentStatus,
          connection,
        );
      await this.#paymentRepository.updateStatus(
        payment.id,
        { statusId: newPaymentStatusId },
        connection,
      );
      await this.#bookingService.recordPaymentOutcome(
        payment.bookingId,
        isFullyRefunded ? 'REFUNDED_ONLINE' : 'PARTIALLY_REFUNDED_ONLINE',
        { connection },
      );
      // Launch-blocker remediation (P0-B): only reached once the refund
      // has genuinely succeeded with the provider — never on a failed/
      // declined refund, which leaves REQUIRES_MANUAL_REVIEW untouched.
      await this.#bookingService.resolveManualReviewRefundSystemInternal(
        payment.bookingId,
        { connection },
      );
      await this.#ledgerRepository.create(
        {
          entryType: 'REFUND_ISSUED',
          paymentId: payment.id,
          refundId: updatedRefund.id,
          bookingId: payment.bookingId,
          partnerId: null,
          amount: `-${refund.amount}`,
          currencyId: currency.id,
          description: `Refund issued for booking #${payment.bookingId}`,
        },
        connection,
      );
      await this.#ledgerRepository.create(
        {
          entryType: 'PARTNER_PAYABLE_REVERSED',
          paymentId: payment.id,
          refundId: updatedRefund.id,
          bookingId: payment.bookingId,
          partnerId: payment.partnerId,
          amount: `-${refund.amount}`,
          currencyId: currency.id,
          description: `Payable reversed for booking #${payment.bookingId} refund`,
        },
        connection,
      );
    } else if (isDefinitiveFailure) {
      await this.#paymentRepository.releaseRefundAmount(
        payment.id,
        refund.amount,
        connection,
      );
    }
    // else: PROCESSING — leave the reservation in place; a later webhook
    // (`#applyRefundWebhookEvent`) resolves it to SUCCEEDED or FAILED.

    return {
      ...updatedRefund,
      bookingId: payment.bookingId,
      customerUserId: payment.customerUserId,
      partnerId: payment.partnerId,
    };
  }

  async #publishRefundOutcomeEvent(refund) {
    if (refund.statusCode !== 'SUCCEEDED' && refund.statusCode !== 'FAILED') {
      return;
    }
    await this.#eventBus.publish(
      createDomainEvent({
        eventType:
          refund.statusCode === 'SUCCEEDED'
            ? EVENT_TYPES.REFUND_SUCCEEDED
            : EVENT_TYPES.REFUND_FAILED,
        actorId: null,
        resourceType: 'refund',
        resourceId: refund.id,
        payload: {
          refundReference: refund.refundReference,
          paymentId: refund.paymentId,
          bookingId: refund.bookingId,
          customerUserId: refund.customerUserId,
          partnerId: refund.partnerId,
          amount: refund.amount,
          currency: refund.currencyCode,
        },
      }),
    );
  }

  /**
   * System-internal read, no principal/visibility check — used only by
   * `jobs/localProviderSettlementQueue.js`'s worker, which runs outside
   * any authenticated request context. Never exposed via a route.
   */
  async getPaymentSystemInternal(id) {
    return this.#paymentRepository.findById(id);
  }

  /**
   * P0.2 (Master Roadmap) — system-internal, no principal: the one call
   * `BookingService#cancelBooking` makes into this module to find out
   * whether a booking it just cancelled has real, captured money still
   * needing a decision. Never exposed via any HTTP route.
   */
  async getRefundablePaymentForBookingSystemInternal(bookingId) {
    return this.#paymentRepository.findRefundableForBooking(bookingId);
  }

  /**
   * Manual-capture booking payment flow — system-internal, no principal:
   * `BookingService#confirmBooking`/`#rejectBooking`/`#cancelBooking` all
   * call this to find out whether a booking they just transitioned has an
   * authorized-but-not-yet-captured payment that now needs a capture or
   * void decision. Never exposed via any HTTP route — mirrors
   * `getRefundablePaymentForBookingSystemInternal`'s identical shape.
   */
  async getAuthorizedPaymentForBookingSystemInternal(bookingId) {
    return this.#paymentRepository.findAuthorizedForBooking(bookingId);
  }

  /** 404-masked: visible to the payment's own customer, the booking's partner owner/staff, or `payment.view`. */
  async getPayment(principal, id) {
    const payment = await this.#paymentRepository.findById(id);
    if (!payment) throw new NotFoundError('Payment not found.');
    if (!principal) throw new NotFoundError('Payment not found.');

    const isCustomer = payment.customerUserId === principal.userId;
    if (!isCustomer) {
      const allowed = await this.#isOwnerOrHasPermission(
        principal,
        payment.partnerId,
        VIEW_PERMISSION,
      );
      if (!allowed) throw new NotFoundError('Payment not found.');
    }
    const hydrated = await this.#hydrate(payment);
    return {
      ...hydrated,
      clientSecret: await this.#resolveClientSecretForResume(payment),
    };
  }

  /**
   * Stripe Elements checkout flow: a page reload while a payment is still
   * `CREATED`/`REQUIRES_ACTION` (the customer hasn't finished — or hasn't
   * started — confirming) must be resumable without ever creating a
   * second PaymentIntent (`findActiveForBooking`'s own guard already
   * refuses a second `createPaymentIntent` call while one is still
   * non-terminal, so there is no other way back to a working "Pay Now").
   * Never persisted — re-fetched fresh from the provider on every read,
   * and only for the one provider (Stripe) that actually has a client
   * secret to resume with; `LocalPaymentProvider` never reaches either
   * status for more than the duration of one request.
   */
  async #resolveClientSecretForResume(payment) {
    if (payment.providerCode !== 'stripe') return null;
    if (!['CREATED', 'REQUIRES_ACTION'].includes(payment.statusCode)) {
      return null;
    }
    try {
      const provider = this.#providerRegistry.getProvider(payment.providerCode);
      const retrieved = await provider.retrievePayment(
        payment.providerPaymentId,
      );
      return retrieved.clientSecret ?? null;
    } catch (err) {
      log.error(
        { err, paymentId: payment.id },
        'Failed to refresh Stripe client secret for resume',
      );
      return null;
    }
  }

  /** Same 3-tier visibility pattern as `bookingService.listBookings`. */
  async listPayments(principal, filters = {}, paginationOpts = {}) {
    if (!principal) throw new AuthenticationError();
    const { partnerId, viewAll, status, bookingId } = filters;

    if (partnerId !== undefined) {
      await this.#assertOwnerOrPermission(
        principal,
        partnerId,
        VIEW_PERMISSION,
      );
      return this.#paymentRepository.list(
        { partnerId, bookingId, statusCode: status },
        paginationOpts,
      );
    }
    if (viewAll) {
      const isAdmin = await this.#permissionResolver.hasPermission(
        principal.roles,
        VIEW_PERMISSION,
      );
      if (!isAdmin) throw new AuthorizationError();
      return this.#paymentRepository.list(
        { bookingId, statusCode: status },
        paginationOpts,
      );
    }
    return this.#paymentRepository.list(
      { customerUserId: principal.userId, bookingId, statusCode: status },
      paginationOpts,
    );
  }

  /**
   * Admin-only (Phase 16 spec §17: "Admin: refund actions only with
   * explicit permission" — no owner-fallback like `payment.view` gets,
   * since a partner must never be able to move money out of a payment on
   * their own authority).
   *
   * Stripe go-live preflight fix: unlike the auto-refund path (a stable
   * `auto-refund:booking:${id}` key — the same logical action can only
   * ever mean "refund this cancellation in full"), an admin refund
   * request previously had NO server-side idempotency guard at all when
   * the caller omitted a key — a double-submitted request (a UI double-
   * click, or a client retry after a lost response) could create two
   * separate real refunds, each individually within the refundable
   * balance. A key derived from the exact request content (payment,
   * amount, reason) is synthesized here when none is supplied: an exact
   * duplicate of the SAME request dedupes via `findByIdempotencyKey`
   * (`#executeRefund`'s existing check), while a genuinely different
   * amount/reason for the same payment still produces its own key and is
   * never blocked.
   */
  async createRefund(
    principal,
    paymentId,
    { amount, reason, idempotencyKey } = {},
  ) {
    if (!principal) throw new AuthenticationError();
    this.#assertPaymentsEnabled();
    const canRefund = await this.#permissionResolver.hasPermission(
      principal.roles,
      REFUND_PERMISSION,
    );
    if (!canRefund) throw new AuthorizationError();
    const effectiveIdempotencyKey =
      idempotencyKey ??
      `admin-refund:payment:${paymentId}:${createHash('sha256')
        .update(`${amount ?? ''}:${reason ?? ''}`)
        .digest('hex')
        .slice(0, 32)}`;
    return this.#executeRefund(principal.userId, paymentId, {
      amount,
      reason,
      idempotencyKey: effectiveIdempotencyKey,
    });
  }

  /**
   * P0.2 (Master Roadmap) — trusted-caller-only, no principal/permission
   * check: `BookingService#cancelBooking` is the only caller, applying
   * `cancellationRefundPolicy.js`'s AUTO_REFUND_FULL outcome (a business
   * unilaterally cancelling owes a full refund; the customer didn't
   * choose to trigger this, so there is no permission for them to hold).
   * Never exposed via any HTTP route — mirrors `getPaymentSystemInternal`/
   * `AvailabilityService#applySystemExternalReservation`'s identical
   * "system-level, no principal" precedent elsewhere in this codebase.
   */
  async issueSystemRefund(paymentId, { amount, reason, idempotencyKey } = {}) {
    return this.#executeRefund(null, paymentId, {
      amount,
      reason,
      idempotencyKey,
    });
  }

  /**
   * Manual-capture booking payment flow — captures a payment the vendor
   * has just accepted (`BookingService#confirmBooking`). System-internal,
   * no principal/permission check: the vendor's authority was already
   * established by `confirmBooking`'s own `booking.confirm` permission
   * check; never exposed via any HTTP route — mirrors `issueSystemRefund`'s
   * identical "trusted caller only" shape.
   */
  async capturePaymentForBookingSystemInternal(paymentId) {
    return this.#executeCaptureOrVoid(paymentId, 'capture');
  }

  /**
   * Manual-capture booking payment flow — releases (voids) an
   * authorization that will never be captured: the vendor rejected the
   * booking (`BookingService#rejectBooking`), or the booking was
   * cancelled before the vendor ever acted (`#cancelBooking`).
   * System-internal, no principal — mirrors `capturePaymentForBookingSystemInternal`.
   */
  async voidPaymentForBookingSystemInternal(paymentId) {
    return this.#executeCaptureOrVoid(paymentId, 'void');
  }

  /**
   * TX-1 (lock + validate the payment is still `AUTHORIZED`) -> provider
   * call outside any transaction/lock -> TX-2 (`#applyProviderResult`, the
   * same shared finalizer `createPaymentIntent`/the webhook path use).
   * Mirrors `createPaymentIntent`'s split, for the same reason:
   * `transaction.js`'s rule against holding a transaction open across an
   * external network call. Unlike `#executeRefund`, there is no amount to
   * reserve here — an `AUTHORIZED` payment is already the exclusive,
   * non-terminal state for its booking (`findActiveForBooking`'s guard),
   * so no concurrent second capture/void attempt can race this one.
   */
  async #executeCaptureOrVoid(paymentId, action) {
    const payment = await withTransaction(async (connection) => {
      const locked = await this.#paymentRepository.lockById(
        paymentId,
        connection,
      );
      if (!locked) throw new NotFoundError('Payment not found.');
      if (locked.statusCode !== 'AUTHORIZED') {
        throw new ConflictError(
          `Cannot ${action} a payment in status ${locked.statusCode}; only an AUTHORIZED payment can be ${action === 'capture' ? 'captured' : 'voided'}.`,
          'PAYMENT_NOT_AUTHORIZED',
        );
      }
      return locked;
    });

    const provider = this.#providerRegistry.getProvider(payment.providerCode);
    // A network/provider failure here leaves the payment AUTHORIZED —
    // never silently marked FAILED/CANCELLED on a transport error alone.
    // The authorization is untouched provider-side, so this is always
    // safe to retry (and Stripe capture/cancel calls are idempotent by
    // nature: retrying a capture on an already-captured intent, or a
    // cancel on an already-cancelled one, simply returns its current
    // terminal state rather than erroring).
    const providerResult =
      action === 'capture'
        ? await provider.capturePayment(payment.providerPaymentId, {
            amount: payment.totalAmount,
          })
        : await provider.cancelPayment(payment.providerPaymentId);

    const updated = await withTransaction(async (connection) => {
      const lockedPayment = await this.#paymentRepository.lockById(
        payment.id,
        connection,
      );
      return this.#applyProviderResult(
        lockedPayment,
        {
          status: providerResult.status,
          providerPaymentId: providerResult.providerPaymentId,
          failureCode: providerResult.failureCode,
          failureMessage: providerResult.failureMessage,
        },
        { actorId: null, connection },
      );
    });
    await this.#publishOutcomeEvent(updated, null);
    return updated;
  }

  /**
   * TX-1 (validate + atomically reserve + persist CREATED) → provider call
   * outside any transaction/lock → TX-2 (`#applyRefundResult`, shared with
   * the async webhook path). Mirrors `createPaymentIntent`'s split, for the
   * same reason: `transaction.js`'s rule against holding a transaction open
   * across an external network call. `reserveRefundAmount`'s atomic
   * `UPDATE ... WHERE (captured_amount - refunded_amount) >= ?` is the sole
   * concurrency guard against two overlapping refund requests both passing
   * a stale "refundable" check — the row lock during TX-1 makes the
   * post-reservation check below defensive rather than load-bearing.
   */
  async #executeRefund(actorId, paymentId, { amount, reason, idempotencyKey }) {
    if (idempotencyKey) {
      const existing =
        await this.#refundRepository.findByIdempotencyKey(idempotencyKey);
      if (existing) return existing;
    }

    const {
      payment,
      provider,
      currency,
      requested,
      refundRow: createdRefund,
    } = await withTransaction(async (connection) => {
      const lockedPayment = await this.#paymentRepository.lockById(
        paymentId,
        connection,
      );
      if (!lockedPayment) throw new NotFoundError('Payment not found.');
      if (
        !['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(lockedPayment.statusCode)
      ) {
        throw new ConflictError(
          'This payment cannot be refunded in its current state.',
          'PAYMENT_NOT_REFUNDABLE',
        );
      }

      const resolvedCurrency = await findCurrencyByCode(
        lockedPayment.currencyCode,
        connection,
      );
      const captured = Money.fromDecimalString(
        lockedPayment.capturedAmount,
        lockedPayment.currencyCode,
      );
      const alreadyRefunded = Money.fromDecimalString(
        lockedPayment.refundedAmount,
        lockedPayment.currencyCode,
      );
      const refundable = captured.subtract(alreadyRefunded);
      const requestedAmount = Money.fromDecimalString(
        amount,
        lockedPayment.currencyCode,
      );

      if (requestedAmount.isZero() || requestedAmount.isNegative()) {
        throw new ValidationError('Refund amount must be greater than zero.', [
          { field: 'amount', issue: 'INVALID_AMOUNT' },
        ]);
      }
      if (requestedAmount.isGreaterThan(refundable)) {
        throw new ValidationError(
          'Refund amount exceeds the refundable balance for this payment.',
          [{ field: 'amount', issue: 'REFUND_EXCEEDS_REFUNDABLE' }],
        );
      }

      const reserved = await this.#paymentRepository.reserveRefundAmount(
        lockedPayment.id,
        requestedAmount.toDecimalString(),
        connection,
      );
      if (!reserved) {
        throw new ValidationError(
          'Refund amount exceeds the refundable balance for this payment.',
          [{ field: 'amount', issue: 'REFUND_EXCEEDS_REFUNDABLE' }],
        );
      }

      const resolvedProvider = this.#providerRegistry.getProvider(
        lockedPayment.providerCode,
      );
      const createdRefundStatusId =
        await this.#refundRepository.findRefundStatusIdByCode(
          'CREATED',
          connection,
        );
      const newRefund = await this.#refundRepository.create(
        {
          refundReference: generateRefundReference(),
          paymentId: lockedPayment.id,
          amount: requestedAmount.toDecimalString(),
          currencyId: resolvedCurrency.id,
          reason,
          statusId: createdRefundStatusId,
          providerCode: resolvedProvider.code,
          idempotencyKey: idempotencyKey ?? null,
          requestedBy: actorId,
        },
        connection,
      );
      await this.#paymentRepository.createTransaction(
        {
          paymentId: lockedPayment.id,
          refundId: newRefund.id,
          type: 'REFUND_CREATED',
          amount: requestedAmount.toDecimalString(),
          currencyId: resolvedCurrency.id,
          actorId,
        },
        connection,
      );

      return {
        payment: lockedPayment,
        provider: resolvedProvider,
        currency: resolvedCurrency,
        requested: requestedAmount,
        refundRow: newRefund,
      };
    });

    await this.#eventBus.publish(
      createDomainEvent({
        eventType: EVENT_TYPES.REFUND_CREATED,
        actorId,
        resourceType: 'refund',
        resourceId: createdRefund.id,
        payload: {
          refundReference: createdRefund.refundReference,
          paymentId: createdRefund.paymentId,
          bookingId: payment.bookingId,
          customerUserId: payment.customerUserId,
          partnerId: payment.partnerId,
          amount: createdRefund.amount,
          currency: createdRefund.currencyCode,
        },
      }),
    );

    let providerResult;
    try {
      providerResult = await provider.refundPayment(payment.providerPaymentId, {
        amount: requested.toDecimalString(),
        currencyCode: payment.currencyCode,
        reason,
        refundReference: createdRefund.refundReference,
      });
    } catch (err) {
      const failedRefund = await withTransaction(async (connection) => {
        await this.#paymentRepository.releaseRefundAmount(
          payment.id,
          requested.toDecimalString(),
          connection,
        );
        const failedStatusId =
          await this.#refundRepository.findRefundStatusIdByCode(
            'FAILED',
            connection,
          );
        await this.#refundRepository.updateStatus(
          createdRefund.id,
          {
            statusId: failedStatusId,
            failureCode: 'provider_unreachable',
            failureMessage: err.message,
            failedAt: new Date(),
          },
          connection,
        );
        await this.#paymentRepository.createTransaction(
          {
            paymentId: payment.id,
            refundId: createdRefund.id,
            type: 'REFUND_FAILED',
            amount: requested.toDecimalString(),
            currencyId: currency.id,
            actorId,
            metadata: { failureCode: 'provider_unreachable' },
          },
          connection,
        );
        return this.#refundRepository.findById(createdRefund.id, connection);
      });
      await this.#publishRefundOutcomeEvent({
        ...failedRefund,
        bookingId: payment.bookingId,
        customerUserId: payment.customerUserId,
        partnerId: payment.partnerId,
      });
      throw err;
    }

    const refund = await withTransaction(async (connection) => {
      const lockedRefund = await this.#refundRepository.lockById(
        createdRefund.id,
        connection,
      );
      const lockedPayment = await this.#paymentRepository.lockById(
        payment.id,
        connection,
      );
      const applied = await this.#applyRefundResult(
        lockedRefund,
        lockedPayment,
        providerResult,
        { actorId, connection },
      );
      await this.#auditLogger.record(
        {
          actorId,
          action: 'payment.refunded',
          targetType: 'payment',
          targetId: payment.id,
          afterSnapshot: {
            refundId: applied.id,
            amount: applied.amount,
            status: applied.statusCode,
          },
        },
        connection,
      );
      return applied;
    });

    await this.#publishRefundOutcomeEvent(refund);
    return refund;
  }

  /** 404-masked, same visibility as `getPayment` (a refund is only ever reached through its payment). */
  async listRefundsForPayment(principal, paymentId) {
    await this.getPayment(principal, paymentId); // visibility check, discards the hydrated result
    return this.#refundRepository.listForPayment(paymentId);
  }
}

export default PaymentService;
