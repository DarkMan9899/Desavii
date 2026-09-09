/**
 * MySQL-backed Booking repository — Sprint 10 (Booking & Reservation
 * Holds Foundation).
 *
 * Owns `bookings`, `booking_items`, `booking_guests`, and
 * `booking_status_history` (Module Catalog #18), migrated in 0008 but
 * unused until now. Stays inside that migration's documented MVP,
 * no-payment-gateway model: `payment_method` is always `'offline'`,
 * `payment_status_id` only ever moves among the four already-seeded
 * values, no `payments`/`invoices` tables exist to write to.
 *
 * Every write here is expected to run inside a caller-supplied
 * transaction connection (`BookingService` opens one for every mutating
 * call, since a booking write always touches at least two of this
 * repository's four tables together) — but every method still defaults
 * `connection` to the pool, same convention as every other Repository in
 * this codebase, so simple reads (`GET /bookings/:id`) don't need a
 * transaction wrapped around them just to satisfy this signature.
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';
import { mapMysqlError } from '../../../infrastructure/database/errorMapping.js';
import {
  decodeCursor,
  buildPageMeta,
} from '../../../infrastructure/database/pagination.js';
import { toDateString } from '../../../infrastructure/database/dateFormat.js';

/** `TIME` columns round-trip through mysql2 as `HH:MM:SS` strings already — trimmed to `HH:MM` for display, same convention as `mysqlBookableUnitRepository.js`'s identical helper. */
function toTimeString(value) {
  return value ? String(value).slice(0, 5) : null;
}

function toBookingDomain(row) {
  if (!row) return null;
  return {
    id: row.id,
    bookingReference: row.booking_reference,
    customerUserId: row.customer_user_id,
    partnerId: row.partner_id,
    listingId: row.listing_id,
    bookingTypeCode: row.booking_type_code,
    statusId: row.status_id,
    statusCode: row.status_code,
    customerNotes: row.customer_notes,
    vendorNotes: row.vendor_notes,
    guestContactSnapshot:
      typeof row.guest_contact_snapshot === 'string'
        ? JSON.parse(row.guest_contact_snapshot)
        : row.guest_contact_snapshot,
    currencyCode: row.currency_code,
    subtotalAmount: row.subtotal_amount,
    feesAmount: row.fees_amount,
    discountAmount: row.discount_amount,
    totalAmount: row.total_amount,
    paymentMethod: row.payment_method,
    paymentStatusCode: row.payment_status_code,
    requestedAt: row.requested_at,
    confirmedAt: row.confirmed_at,
    rejectedAt: row.rejected_at,
    cancelledAt: row.cancelled_at,
    completedAt: row.completed_at,
    cancellationReason: row.cancellation_reason,
    refundStatus: row.refund_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tripDateFrom: row.trip_date_from ? toDateString(row.trip_date_from) : null,
    tripDateTo: row.trip_date_to ? toDateString(row.trip_date_to) : null,
    // Only present when `list()` was called with `includeNames: true`
    // (the admin-only browsing paths in `BookingService#listBookings`) —
    // `undefined` on every customer/partner self-service list, matching
    // this file's own established "additive, never a per-row N+1" rule
    // (see `toBookingItemResponse`'s identical reasoning in
    // `bookingDto.js`): one JOIN on the admin path instead of an extra
    // lookup per row.
    customerFirstName: row.customer_first_name,
    customerLastName: row.customer_last_name,
    partnerDisplayName: row.partner_display_name,
  };
}

function toItemDomain(row) {
  return {
    id: row.id,
    bookingId: row.booking_id,
    bookableUnitId: row.bookable_unit_id,
    // P2.2E: `unit_label_snapshot` (taken at booking-creation time) wins
    // whenever present — a row created before this snapshot column
    // existed has `NULL` here and falls back to the live
    // `bookable_units`/`bookable_unit_types` LEFT JOIN from
    // `findItemsForBooking` below, exactly as every row did before this
    // change. `null` for a unit that no longer exists AND has no snapshot
    // (the LEFT JOIN makes that possible in principle even though no code
    // path in this repository hard-deletes a `bookable_units` row today;
    // see that method's own comment).
    unitLabel: row.unit_label_snapshot ?? row.unit_label ?? null,
    bookableUnitTypeCode: row.bookable_unit_type_code ?? null,
    dateFrom: toDateString(row.date_from),
    dateTo: toDateString(row.date_to),
    // Sprint A (Time-Aware Booking Foundation): snapshotted at
    // booking-creation time from the selected unit's own
    // `time_slot_start`/`time_slot_end` (see `bookingService.js#resolveItem`)
    // — never client-supplied, so there is nothing here for a client to
    // tamper with. `NULL` for every non-time-slot unit type and every
    // booking created before this migration, same additive/nullable shape
    // as `unit_label_snapshot` above.
    startTime: toTimeString(row.start_time),
    endTime: toTimeString(row.end_time),
    // Sprint B (Car Rental Pickup/Return Interval): snapshotted at
    // booking-creation time from the listing's own single registered
    // location (`bookingService.js#resolveItem` — same-location-return
    // model, see that file's `formatListingLocationLabel`) — never
    // client-supplied. `NULL` for every non-VEHICLE booking and every
    // booking created before this migration.
    pickupLocation: row.pickup_location_snapshot ?? null,
    returnLocation: row.return_location_snapshot ?? null,
    quantity: row.quantity,
    unitPriceAmount: row.unit_price_amount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toGuestDomain(row) {
  return {
    id: row.id,
    bookingItemId: row.booking_item_id,
    fullName: row.full_name,
    documentNumber: row.document_number,
  };
}

const BOOKING_SELECT = `
  b.id, b.booking_reference, b.customer_user_id, b.partner_id, b.listing_id,
  bt.code AS booking_type_code, b.status_id, bs.code AS status_code,
  b.customer_notes, b.vendor_notes, b.guest_contact_snapshot,
  cur.code AS currency_code, b.subtotal_amount, b.fees_amount, b.discount_amount, b.total_amount,
  b.payment_method, ps.code AS payment_status_code,
  b.requested_at, b.confirmed_at, b.rejected_at, b.cancelled_at, b.completed_at,
  b.cancellation_reason, b.refund_status, b.created_at, b.updated_at
`;
const BOOKING_FROM = `
  FROM bookings b
  JOIN booking_types bt ON bt.id = b.booking_type_id
  JOIN booking_statuses bs ON bs.id = b.status_id
  JOIN currencies cur ON cur.id = b.currency_id
  JOIN payment_statuses ps ON ps.id = b.payment_status_id
`;

export class MySqlBookingRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  // --- lookups ---

  async findBookingTypeIdByCode(code, connection = this.#pool) {
    const [rows] = await connection.query(
      'SELECT id FROM booking_types WHERE code = ? LIMIT 1',
      [code],
    );
    return rows[0]?.id ?? null;
  }

  async findStatusIdByCode(code, connection = this.#pool) {
    const [rows] = await connection.query(
      'SELECT id FROM booking_statuses WHERE code = ? LIMIT 1',
      [code],
    );
    return rows[0]?.id ?? null;
  }

  async findPaymentStatusIdByCode(code, connection = this.#pool) {
    const [rows] = await connection.query(
      'SELECT id FROM payment_statuses WHERE code = ? LIMIT 1',
      [code],
    );
    return rows[0]?.id ?? null;
  }

  // --- bookings ---

  async createBooking(
    {
      bookingReference,
      customerUserId,
      partnerId,
      listingId,
      bookingTypeId,
      statusId,
      customerNotes,
      guestContactSnapshot,
      currencyId,
      subtotalAmount,
      totalAmount,
      paymentStatusId,
      requestedAt,
      createdBy,
    },
    connection = this.#pool,
  ) {
    try {
      const [result] = await connection.query(
        `INSERT INTO bookings
          (booking_reference, customer_user_id, partner_id, listing_id, booking_type_id, status_id,
           customer_notes, guest_contact_snapshot, currency_id, subtotal_amount, fees_amount,
           discount_amount, total_amount, payment_method, payment_status_id, requested_at,
           created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.00, 0.00, ?, 'offline', ?, ?, ?, ?)`,
        [
          bookingReference,
          customerUserId,
          partnerId,
          listingId,
          bookingTypeId,
          statusId,
          customerNotes ?? null,
          JSON.stringify(guestContactSnapshot),
          currencyId,
          subtotalAmount,
          totalAmount,
          paymentStatusId,
          requestedAt,
          createdBy,
          createdBy,
        ],
      );
      return this.findById(result.insertId, connection);
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  async findById(id, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT ${BOOKING_SELECT} ${BOOKING_FROM} WHERE b.id = ? AND b.deleted_at IS NULL LIMIT 1`,
      [id],
    );
    return toBookingDomain(rows[0]);
  }

  /** Row-locks the booking for a status transition — must run inside a transaction (no pool default: `FOR UPDATE` outside a transaction is meaningless). */
  async lockById(id, connection) {
    const [rows] = await connection.query(
      `SELECT ${BOOKING_SELECT} ${BOOKING_FROM} WHERE b.id = ? AND b.deleted_at IS NULL FOR UPDATE`,
      [id],
    );
    return toBookingDomain(rows[0]);
  }

  async updateStatus(
    id,
    {
      statusId,
      confirmedAt,
      rejectedAt,
      cancelledAt,
      completedAt,
      cancellationReason,
    },
    connection = this.#pool,
  ) {
    const assignments = ['status_id = ?'];
    const values = [statusId];
    if (confirmedAt !== undefined) {
      assignments.push('confirmed_at = ?');
      values.push(confirmedAt);
    }
    if (rejectedAt !== undefined) {
      assignments.push('rejected_at = ?');
      values.push(rejectedAt);
    }
    if (cancelledAt !== undefined) {
      assignments.push('cancelled_at = ?');
      values.push(cancelledAt);
    }
    if (completedAt !== undefined) {
      assignments.push('completed_at = ?');
      values.push(completedAt);
    }
    if (cancellationReason !== undefined) {
      assignments.push('cancellation_reason = ?');
      values.push(cancellationReason);
    }

    await connection.query(
      `UPDATE bookings SET ${assignments.join(', ')} WHERE id = ?`,
      [...values, id],
    );
  }

  /** Phase 16 — the sole write path for the booking-facing payment summary column, called only from `BookingService#recordPaymentOutcome`. */
  async updatePaymentStatus(id, paymentStatusId, connection = this.#pool) {
    await connection.query(
      'UPDATE bookings SET payment_status_id = ? WHERE id = ?',
      [paymentStatusId, id],
    );
  }

  /** P0.2 — the sole write path for the initial `refund_status` transition out of `NOT_APPLICABLE`, called only from `BookingService#cancelBooking` after resolving `cancellationRefundPolicy.js`'s outcome. Every later transition (a resolved manual review) goes through `transitionRefundStatus` below instead. */
  async updateRefundStatus(id, refundStatus, connection = this.#pool) {
    await connection.query(
      'UPDATE bookings SET refund_status = ? WHERE id = ?',
      [refundStatus, id],
    );
  }

  /**
   * Launch-blocker remediation (P0-B) — conditional transition: only
   * writes when the booking's *current* `refund_status` still matches
   * `fromStatus`, and reports whether it did via `affectedRows`. This is
   * the write path for resolving a `REQUIRES_MANUAL_REVIEW` booking (to
   * either `MANUALLY_REFUNDED` or `RESOLVED_NO_REFUND`) — the WHERE
   * clause is what makes a duplicate/concurrent resolution attempt, or a
   * refund against a booking that was never in manual review, a safe
   * no-op rather than a data-corrupting overwrite.
   */
  async transitionRefundStatus(
    id,
    { fromStatus, toStatus },
    connection = this.#pool,
  ) {
    const [result] = await connection.query(
      'UPDATE bookings SET refund_status = ? WHERE id = ? AND refund_status = ?',
      [toStatus, id, fromStatus],
    );
    return result.affectedRows > 0;
  }

  /** Owner/admin/customer visibility is the Service's job — this is a plain filtered list. */
  async list(
    filters = {},
    { cursor = null, limit = 20 } = {},
    connection = this.#pool,
  ) {
    const conditions = ['b.deleted_at IS NULL'];
    const params = [];
    const { includeNames = false } = filters;

    if (filters.customerUserId !== undefined) {
      conditions.push('b.customer_user_id = ?');
      params.push(filters.customerUserId);
    }
    if (filters.partnerId !== undefined) {
      conditions.push('b.partner_id = ?');
      params.push(filters.partnerId);
    }
    if (filters.statusCode !== undefined) {
      conditions.push('bs.code = ?');
      params.push(filters.statusCode);
    }
    // Launch-blocker remediation (P0-B/4D) — admin discoverability for
    // REQUIRES_MANUAL_REVIEW bookings (previously findable nowhere).
    // `b.refund_status` is a plain, unconstrained column (migration
    // 0028), filtered the same direct-equality way as `bs.code` above.
    if (filters.refundStatus !== undefined) {
      conditions.push('b.refund_status = ?');
      params.push(filters.refundStatus);
    }
    // Sprint D-2 (Partner Calendar source-aware UX): narrows to bookings
    // with at least one `booking_items` row for this unit whose stay
    // overlaps [dateFrom, dateTo] — an EXISTS subquery rather than a JOIN
    // so a booking with several matching items still yields exactly one
    // row, same "don't fan out the outer row set" convention as the
    // `trip` subquery below.
    if (filters.unitId !== undefined) {
      const itemConditions = [
        'bi.booking_id = b.id',
        'bi.bookable_unit_id = ?',
      ];
      const itemParams = [filters.unitId];
      if (filters.dateFrom !== undefined) {
        itemConditions.push('bi.date_to >= ?');
        itemParams.push(filters.dateFrom);
      }
      if (filters.dateTo !== undefined) {
        itemConditions.push('bi.date_from <= ?');
        itemParams.push(filters.dateTo);
      }
      conditions.push(
        `EXISTS (SELECT 1 FROM booking_items bi WHERE ${itemConditions.join(' AND ')})`,
      );
      params.push(...itemParams);
    }

    const decoded = decodeCursor(cursor);
    if (decoded?.id) {
      conditions.push('b.id < ?');
      params.push(decoded.id);
    }

    const [rows] = await connection.query(
      `SELECT ${BOOKING_SELECT}, trip.date_from AS trip_date_from, trip.date_to AS trip_date_to
       ${includeNames ? ', cu.first_name AS customer_first_name, cu.last_name AS customer_last_name, p.display_name AS partner_display_name' : ''}
       ${BOOKING_FROM}
       LEFT JOIN (
         SELECT booking_id, MIN(date_from) AS date_from, MAX(date_to) AS date_to
         FROM booking_items
         GROUP BY booking_id
       ) trip ON trip.booking_id = b.id
       ${includeNames ? 'LEFT JOIN users cu ON cu.id = b.customer_user_id LEFT JOIN partners p ON p.id = b.partner_id' : ''}
       WHERE ${conditions.join(' AND ')}
       ORDER BY b.id DESC
       LIMIT ?`,
      [...params, limit + 1],
    );

    const { rows: pageRows, meta } = buildPageMeta(rows, limit, (row) => ({
      id: row.id,
    }));
    return { rows: pageRows.map(toBookingDomain), meta };
  }

  // --- booking_items ---

  async createBookingItem(
    {
      bookingId,
      bookableUnitId,
      unitLabelSnapshot,
      dateFrom,
      dateTo,
      startTime,
      endTime,
      pickupLocationSnapshot,
      returnLocationSnapshot,
      quantity,
      unitPriceAmount,
    },
    connection = this.#pool,
  ) {
    const [result] = await connection.query(
      `INSERT INTO booking_items
        (booking_id, bookable_unit_id, unit_label_snapshot, date_from, date_to, start_time, end_time,
         pickup_location_snapshot, return_location_snapshot, quantity, unit_price_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bookingId,
        bookableUnitId,
        unitLabelSnapshot ?? null,
        dateFrom,
        dateTo,
        startTime ?? null,
        endTime ?? null,
        pickupLocationSnapshot ?? null,
        returnLocationSnapshot ?? null,
        quantity,
        unitPriceAmount,
      ],
    );
    return result.insertId;
  }

  /**
   * P2.2B: LEFT JOINs `bookable_units`/`bookable_unit_types` purely to
   * enrich the response with `unit_label`/`bookable_unit_type` (same
   * "join to enrich, never a second write-owner" convention this
   * repository already follows elsewhere) — read-only, no new capability,
   * no migration; `booking_items.bookable_unit_id` already carries the
   * live FK this joins through.
   *
   * P2.2E: the live-joined `bu.unit_label` is now only a FALLBACK for rows
   * created before `unit_label_snapshot` existed — `toItemDomain` prefers
   * the snapshot whenever it's non-null. The JOIN itself stays exactly as
   * it was (still needed for `bookable_unit_type_code` on every row, and
   * as the legacy-row fallback), it just no longer solely determines the
   * displayed label for a post-migration booking.
   */
  async findItemsForBooking(bookingId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT bi.*, bu.unit_label, but.code AS bookable_unit_type_code
       FROM booking_items bi
       LEFT JOIN bookable_units bu ON bu.id = bi.bookable_unit_id
       LEFT JOIN bookable_unit_types but ON but.id = bu.bookable_unit_type_id
       WHERE bi.booking_id = ?
       ORDER BY bi.id ASC`,
      [bookingId],
    );
    return rows.map(toItemDomain);
  }

  // --- booking_guests ---

  async createBookingGuest(
    { bookingItemId, fullName, documentNumber },
    connection = this.#pool,
  ) {
    const [result] = await connection.query(
      `INSERT INTO booking_guests (booking_item_id, full_name, document_number)
       VALUES (?, ?, ?)`,
      [bookingItemId, fullName, documentNumber ?? null],
    );
    return result.insertId;
  }

  async findGuestsForBookingItems(bookingItemIds, connection = this.#pool) {
    if (bookingItemIds.length === 0) return [];
    const placeholders = bookingItemIds.map(() => '?').join(', ');
    const [rows] = await connection.query(
      `SELECT * FROM booking_guests WHERE booking_item_id IN (${placeholders}) ORDER BY id ASC`,
      bookingItemIds,
    );
    return rows.map(toGuestDomain);
  }

  // --- booking_status_history ---

  async createStatusHistory(
    { bookingId, fromStatusId, toStatusId, changedBy },
    connection = this.#pool,
  ) {
    await connection.query(
      `INSERT INTO booking_status_history (booking_id, from_status_id, to_status_id, changed_by)
       VALUES (?, ?, ?, ?)`,
      [bookingId, fromStatusId ?? null, toStatusId, changedBy ?? null],
    );
  }

  async findStatusHistoryForBooking(bookingId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT bh.id, bh.booking_id, fs.code AS from_status_code, ts.code AS to_status_code,
              bh.changed_by, bh.created_at
       FROM booking_status_history bh
       LEFT JOIN booking_statuses fs ON fs.id = bh.from_status_id
       JOIN booking_statuses ts ON ts.id = bh.to_status_id
       WHERE bh.booking_id = ?
       ORDER BY bh.id ASC`,
      [bookingId],
    );
    return rows;
  }

  /** Bookings still `PENDING_VENDOR` past their SLA window — the scheduled expiry sweep's read. */
  async findPendingVendorPastSla(slaHours, limit, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT ${BOOKING_SELECT} ${BOOKING_FROM}
       WHERE bs.code = 'PENDING_VENDOR' AND b.deleted_at IS NULL
         AND b.requested_at <= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? HOUR)
       ORDER BY b.requested_at ASC
       LIMIT ?`,
      [slaHours, limit],
    );
    return rows.map(toBookingDomain);
  }
}

export default MySqlBookingRepository;
