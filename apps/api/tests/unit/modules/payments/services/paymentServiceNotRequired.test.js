/**
 * Step L6.2H2B — `PaymentService#createPaymentIntent` refuses a booking that
 * never takes platform payment before touching anything: no payment row, no
 * booking payment-status change, no provider call.
 *
 * Payments are switched on for this file (set before the config is
 * imported), so the refusal comes from the payment-requirement rule, never
 * from the "payments disabled" gate.
 */

import { describe, test, expect, beforeAll, jest } from '@jest/globals';

let PaymentService;

beforeAll(async () => {
  process.env.PAYMENTS_ENABLED = 'true';
  ({ PaymentService } =
    await import('../../../../../src/modules/payments/services/paymentService.js'));
});

function buildService(booking) {
  const provider = { code: 'local', createPaymentIntent: jest.fn() };
  const paymentRepository = {
    findByIdempotencyKey: jest.fn(),
    findActiveForBooking: jest.fn(),
    create: jest.fn(),
    createTransaction: jest.fn(),
  };
  const bookingService = {
    getBooking: jest.fn().mockResolvedValue(booking),
    recordPaymentOutcome: jest.fn(),
  };
  const providerRegistry = {
    getDefaultProvider: jest.fn().mockReturnValue(provider),
  };
  const service = new PaymentService({
    paymentRepository,
    refundRepository: {},
    providerEventRepository: {},
    ledgerRepository: {},
    providerRegistry,
    bookingService,
    permissionResolver: {},
    auditLogger: { record: jest.fn() },
  });
  return { service, provider, paymentRepository, bookingService };
}

const CUSTOMER = { userId: 7, roles: ['customer'] };

describe('PaymentService#createPaymentIntent — payment not required', () => {
  test.each([
    ['a new, free restaurant reservation', 'RESTAURANT_RESERVATION', '0.00'],
    [
      'a historical restaurant reservation with a stored total',
      'RESTAURANT_RESERVATION',
      '6500.00',
    ],
    ['a zero-total booking of another type', 'TOUR_BOOKING', '0.00'],
  ])(
    '%s is refused before any write or provider call',
    async (_label, bookingTypeCode, totalAmount) => {
      const { service, provider, paymentRepository, bookingService } =
        buildService({
          id: 41,
          customerUserId: CUSTOMER.userId,
          statusCode: 'PENDING_VENDOR',
          bookingTypeCode,
          totalAmount,
          currencyCode: 'AMD',
        });

      await expect(
        service.createPaymentIntent(CUSTOMER, 41),
      ).rejects.toMatchObject({
        code: 'PAYMENT_NOT_REQUIRED',
      });

      expect(paymentRepository.findActiveForBooking).not.toHaveBeenCalled();
      expect(paymentRepository.create).not.toHaveBeenCalled();
      expect(paymentRepository.createTransaction).not.toHaveBeenCalled();
      expect(bookingService.recordPaymentOutcome).not.toHaveBeenCalled();
      expect(provider.createPaymentIntent).not.toHaveBeenCalled();
    },
  );

  test("another customer's booking is still refused as unauthorized first", async () => {
    const { service, provider } = buildService({
      id: 41,
      customerUserId: 99,
      statusCode: 'PENDING_VENDOR',
      bookingTypeCode: 'RESTAURANT_RESERVATION',
      totalAmount: '0.00',
      currencyCode: 'AMD',
    });

    await expect(
      service.createPaymentIntent(CUSTOMER, 41),
    ).rejects.toMatchObject({
      httpStatus: 403,
    });
    expect(provider.createPaymentIntent).not.toHaveBeenCalled();
  });
});
