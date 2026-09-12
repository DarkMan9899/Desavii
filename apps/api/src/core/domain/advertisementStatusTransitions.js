/**
 * Advertisement (Featured Listings) status transition rules — Sprint 5
 * §11's manual-payment workflow (see
 * docs/SPRINT_5_DATABASE_FOUNDATION.md §5.2 for the state diagram this
 * encodes). Pure domain logic, mirrors bookingStatusTransitions.js's
 * shape.
 *
 * Sprint E (TOP/Featured Listings + Promotion Engine) added the
 * `-> CANCELLED` edge from PAID_MANUAL/APPROVED/SCHEDULED/ACTIVE: the
 * original Sprint 5 diagram only reached CANCELLED from
 * AWAITING_OFFLINE_PAYMENT, because no feature built against this
 * machine yet needed to stop an already-paid or already-live promotion
 * early. Sprint E's Admin "end/cancel" action does — see
 * `AdvertisementService#cancel` — so this is a genuine, minimal
 * completion of the existing lifecycle, not a new one.
 *
 * Pass 7B (brief §13/§14) added `PAUSED`, reachable only from SCHEDULED/
 * ACTIVE (the two "visible or about to be visible" states — pausing a
 * request still awaiting payment/approval is meaningless, CANCEL already
 * covers that) and resumable back to ACTIVE/SCHEDULED (server-decided by
 * `start_date` vs. today, the same rule `AdvertisementService#approve`
 * already uses) or CANCELLED (end it outright while paused). Distinct
 * from CANCELLED: pausing is reversible, cancelling is terminal.
 */

const TRANSITIONS = Object.freeze({
  REQUEST_SUBMITTED: Object.freeze(['AWAITING_OFFLINE_PAYMENT', 'REJECTED']),
  AWAITING_OFFLINE_PAYMENT: Object.freeze(['PAID_MANUAL', 'CANCELLED']),
  PAID_MANUAL: Object.freeze(['APPROVED', 'CANCELLED']),
  APPROVED: Object.freeze(['SCHEDULED', 'ACTIVE', 'CANCELLED']),
  SCHEDULED: Object.freeze(['ACTIVE', 'CANCELLED', 'PAUSED']),
  ACTIVE: Object.freeze(['EXPIRED', 'CANCELLED', 'PAUSED']),
  PAUSED: Object.freeze(['ACTIVE', 'SCHEDULED', 'CANCELLED']),
  REJECTED: Object.freeze([]),
  CANCELLED: Object.freeze([]),
  EXPIRED: Object.freeze([]),
});

export const ADVERTISEMENT_STATUSES = Object.freeze(Object.keys(TRANSITIONS));

export function isValidAdvertisementStatusTransition(fromStatus, toStatus) {
  const allowed = TRANSITIONS[fromStatus];
  if (!allowed) {
    throw new TypeError(`Unknown advertisement status "${fromStatus}".`);
  }
  if (!(toStatus in TRANSITIONS)) {
    throw new TypeError(`Unknown advertisement status "${toStatus}".`);
  }
  return allowed.includes(toStatus);
}

export function isTerminalAdvertisementStatus(status) {
  if (!(status in TRANSITIONS)) {
    throw new TypeError(`Unknown advertisement status "${status}".`);
  }
  return TRANSITIONS[status].length === 0;
}

export default {
  ADVERTISEMENT_STATUSES,
  isValidAdvertisementStatusTransition,
  isTerminalAdvertisementStatus,
};
