/**
 * MySQL-backed BookableUnit repository.
 *
 * Owns `bookable_units` (Module Catalog #15). `source_table`/`source_id`
 * is the polymorphic pointer migration `0007` reserves for a future
 * per-type inventory row (`hotel_rooms.id`, etc.) — this sprint's own
 * caller (`BookableUnitService.registerUnit`) passes the documented
 * placeholder (`source_table = 'listings'`, `source_id = listing.id`);
 * a future Hotels/Tours module calls the same repository methods with
 * real values, unchanged.
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';
import { mapMysqlError } from '../../../infrastructure/database/errorMapping.js';
import {
  scopeActive,
  softDeleteAssignment,
} from '../../../infrastructure/database/softDelete.js';

const SELECT_COLUMNS = `
  bu.id, bu.listing_id, bu.bookable_unit_type_id, but.code AS bookable_unit_type_code,
  bu.source_table, bu.source_id, bu.capacity,
  bu.time_slot_start, bu.time_slot_end, bu.unit_label,
  bu.max_guests, bu.bed_configuration,
  bu.base_price_amount, bu.base_price_currency_id, cur.code AS base_price_currency_code,
  bu.room_size_sqm, bu.bathroom_type, bu.view_type, bu.smoking_policy,
  bu.created_at, bu.updated_at
`;
const FROM_JOINED = `
  FROM bookable_units bu
  JOIN bookable_unit_types but ON but.id = bu.bookable_unit_type_id
  LEFT JOIN currencies cur ON cur.id = bu.base_price_currency_id
`;

/**
 * `mysql2` returns a JSON column already parsed into a JS value for a
 * normal SELECT — but stays defensive (a raw string would mean a driver/
 * config change slipped in) rather than assuming.
 */
function toBedConfiguration(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}

/** `TIME` columns round-trip through mysql2 as `HH:MM:SS` strings already — trimmed to `HH:MM` for display. */
function toTimeString(value) {
  return value ? String(value).slice(0, 5) : null;
}

function toDomain(row) {
  if (!row) return null;
  return {
    id: row.id,
    listingId: row.listing_id,
    bookableUnitTypeId: row.bookable_unit_type_id,
    bookableUnitTypeCode: row.bookable_unit_type_code,
    sourceTable: row.source_table,
    sourceId: row.source_id,
    capacity: row.capacity,
    timeSlotStart: toTimeString(row.time_slot_start),
    timeSlotEnd: toTimeString(row.time_slot_end),
    unitLabel: row.unit_label,
    maxGuests: row.max_guests,
    bedConfiguration: toBedConfiguration(row.bed_configuration),
    basePriceAmount: row.base_price_amount,
    basePriceCurrencyId: row.base_price_currency_id,
    basePriceCurrencyCode: row.base_price_currency_code,
    roomSizeSqm: row.room_size_sqm,
    bathroomType: row.bathroom_type,
    viewType: row.view_type,
    smokingPolicy: row.smoking_policy,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTranslationDomain(row) {
  return {
    languageCode: row.language_code,
    description: row.description,
  };
}

/** Mirrors `mysqlListingRepository.js`'s own `toMediaDomain` shape (minus alt-text/caption — not an authored field for room media in this sprint). */
function toMediaDomain(row) {
  return {
    id: row.id,
    mediableId: row.mediable_id,
    mediaTypeCode: row.media_type_code,
    url: row.url,
    thumbnailUrl: row.thumbnail_url,
    position: row.position,
    isCover: Boolean(row.is_cover),
    moderationStatusCode: row.moderation_status_code,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    ownerUserId: row.owner_user_id,
    createdAt: row.created_at,
  };
}

export class MySqlBookableUnitRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  async findTypeIdByCode(code, connection = this.#pool) {
    const [rows] = await connection.query(
      'SELECT id FROM bookable_unit_types WHERE code = ? LIMIT 1',
      [code],
    );
    return rows[0]?.id ?? null;
  }

  async findById(id, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT ${SELECT_COLUMNS} ${FROM_JOINED} WHERE bu.id = ? AND ${scopeActive('bu')} LIMIT 1`,
      [id],
    );
    return toDomain(rows[0]);
  }

  /**
   * Step L3.1 — row-locks the unit for a media-attach transaction, same
   * convention as `mysqlListingRepository.js#lockById`: the identical
   * base-row shape `findById` reads, plus `FOR UPDATE`, so it's only ever
   * meaningful inside a transaction. Unlike the listings version, this
   * keeps the `scopeActive` filter — there is no admin flow here that
   * needs to resolve a soft-deleted unit, so "not found" is the correct,
   * simple outcome for a unit retired mid-flight.
   */
  async lockById(id, connection) {
    const [rows] = await connection.query(
      `SELECT ${SELECT_COLUMNS} ${FROM_JOINED} WHERE bu.id = ? AND ${scopeActive('bu')} FOR UPDATE`,
      [id],
    );
    return toDomain(rows[0]);
  }

  async listForListing(listingId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT ${SELECT_COLUMNS} ${FROM_JOINED} WHERE bu.listing_id = ? AND ${scopeActive('bu')} ORDER BY bu.id ASC`,
      [listingId],
    );
    return rows.map(toDomain);
  }

  /**
   * Idempotency key for `BookableUnitService.registerUnit`'s find-or-create.
   * `unitLabel` is part of the key (compared via `<=>` NULL-safe equality,
   * since most callers pass no label at all) so that registering several
   * distinct time-slot units for the same listing/type — e.g. an
   * Activity's "09:00" and "14:00" departures — never collapses into one
   * unit; each distinct label is its own row.
   */
  async findMatching(
    { listingId, bookableUnitTypeId, sourceTable, sourceId, unitLabel },
    connection = this.#pool,
  ) {
    const [rows] = await connection.query(
      `SELECT ${SELECT_COLUMNS} ${FROM_JOINED}
       WHERE bu.listing_id = ? AND bu.bookable_unit_type_id = ?
         AND bu.source_table = ? AND bu.source_id = ?
         AND bu.unit_label <=> ?
         AND ${scopeActive('bu')}
       LIMIT 1`,
      [listingId, bookableUnitTypeId, sourceTable, sourceId, unitLabel ?? null],
    );
    return toDomain(rows[0]);
  }

  async create(
    {
      listingId,
      bookableUnitTypeId,
      sourceTable,
      sourceId,
      capacity,
      timeSlotStart,
      timeSlotEnd,
      unitLabel,
      maxGuests,
      bedConfiguration,
      basePriceAmount,
      basePriceCurrencyId,
      roomSizeSqm,
      bathroomType,
      viewType,
      smokingPolicy,
      createdBy,
    },
    connection = this.#pool,
  ) {
    try {
      const [result] = await connection.query(
        `INSERT INTO bookable_units
          (listing_id, bookable_unit_type_id, source_table, source_id, capacity,
           time_slot_start, time_slot_end, unit_label, max_guests, bed_configuration,
           base_price_amount, base_price_currency_id,
           room_size_sqm, bathroom_type, view_type, smoking_policy,
           created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          listingId,
          bookableUnitTypeId,
          sourceTable,
          sourceId,
          capacity,
          timeSlotStart ?? null,
          timeSlotEnd ?? null,
          unitLabel ?? null,
          maxGuests ?? null,
          bedConfiguration ? JSON.stringify(bedConfiguration) : null,
          basePriceAmount ?? null,
          basePriceCurrencyId ?? null,
          roomSizeSqm ?? null,
          bathroomType ?? null,
          viewType ?? null,
          smokingPolicy ?? null,
          createdBy,
          createdBy,
        ],
      );
      return this.findById(result.insertId, connection);
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  /**
   * Partial update — only fields present in `fields` (checked via
   * `!== undefined`, so an explicit `null` genuinely clears a value,
   * matching `availabilityCalendarRepository.update`'s own convention)
   * are written. No-op (a plain `findById`) when nothing was supplied.
   */
  async update(id, fields, connection = this.#pool) {
    const assignments = [];
    const params = [];

    if (fields.unitLabel !== undefined) {
      assignments.push('unit_label = ?');
      params.push(fields.unitLabel);
    }
    if (fields.capacity !== undefined) {
      assignments.push('capacity = ?');
      params.push(fields.capacity);
    }
    if (fields.maxGuests !== undefined) {
      assignments.push('max_guests = ?');
      params.push(fields.maxGuests);
    }
    if (fields.bedConfiguration !== undefined) {
      assignments.push('bed_configuration = ?');
      params.push(
        fields.bedConfiguration === null
          ? null
          : JSON.stringify(fields.bedConfiguration),
      );
    }
    if (fields.basePriceAmount !== undefined) {
      assignments.push('base_price_amount = ?');
      params.push(fields.basePriceAmount);
    }
    if (fields.basePriceCurrencyId !== undefined) {
      assignments.push('base_price_currency_id = ?');
      params.push(fields.basePriceCurrencyId);
    }
    if (fields.roomSizeSqm !== undefined) {
      assignments.push('room_size_sqm = ?');
      params.push(fields.roomSizeSqm);
    }
    if (fields.bathroomType !== undefined) {
      assignments.push('bathroom_type = ?');
      params.push(fields.bathroomType);
    }
    if (fields.viewType !== undefined) {
      assignments.push('view_type = ?');
      params.push(fields.viewType);
    }
    if (fields.smokingPolicy !== undefined) {
      assignments.push('smoking_policy = ?');
      params.push(fields.smokingPolicy);
    }

    if (assignments.length === 0) return this.findById(id, connection);

    assignments.push('updated_by = ?');
    params.push(fields.updatedBy);
    params.push(id);

    try {
      await connection.query(
        `UPDATE bookable_units SET ${assignments.join(', ')} WHERE id = ?`,
        params,
      );
    } catch (err) {
      throw mapMysqlError(err);
    }
    return this.findById(id, connection);
  }

  async softDelete(id, deletedBy, connection = this.#pool) {
    await connection.query(
      `UPDATE bookable_units SET ${softDeleteAssignment()}, deleted_by = ?, updated_by = ? WHERE id = ?`,
      [deletedBy, deletedBy, id],
    );
  }

  // --- bookable_unit_translations (Sprint C-1: room description, genuinely
  // multilingual — mirrors `mysqlListingRepository.insertTranslation`'s
  // exact upsert shape) ---

  /** Full multi-locale set for Partner authoring reload — never resolves to a single display locale here (that's a customer-facing concern, out of scope for this owner-facing read). */
  async listTranslations(bookableUnitId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT l.code AS language_code, t.description
       FROM bookable_unit_translations t
       JOIN languages l ON l.id = t.language_id
       WHERE t.bookable_unit_id = ?`,
      [bookableUnitId],
    );
    return rows.map(toTranslationDomain);
  }

  async upsertTranslation(
    bookableUnitId,
    languageId,
    description,
    connection = this.#pool,
  ) {
    try {
      await connection.query(
        `INSERT INTO bookable_unit_translations (bookable_unit_id, language_id, description)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE description = VALUES(description)`,
        [bookableUnitId, languageId, description],
      );
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  // --- bookable_unit_amenity_listing (Sprint C-1: room-specific amenities
  // — reuses the shared `listing_amenities` catalog verbatim, mirrors
  // `mysqlListingRepository`'s own listing-amenity join handling) ---

  async listAmenityIds(bookableUnitId, connection = this.#pool) {
    const [rows] = await connection.query(
      'SELECT amenity_id FROM bookable_unit_amenity_listing WHERE bookable_unit_id = ? ORDER BY amenity_id ASC',
      [bookableUnitId],
    );
    return rows.map((row) => row.amenity_id);
  }

  /** Full replace — same delete-then-insert shape `mysqlListingRepository.replaceHighlights` already established for this codebase's other "partner submits the entire desired set" collections. */
  async replaceAmenities(bookableUnitId, amenityIds, connection = this.#pool) {
    try {
      await connection.query(
        'DELETE FROM bookable_unit_amenity_listing WHERE bookable_unit_id = ?',
        [bookableUnitId],
      );
      if (amenityIds.length === 0) return;
      const values = amenityIds.map((amenityId) => [bookableUnitId, amenityId]);
      await connection.query(
        'INSERT INTO bookable_unit_amenity_listing (bookable_unit_id, amenity_id) VALUES ?',
        [values],
      );
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  // --- room media (Sprint C-1: `media.mediable_type = 'bookable_unit'` —
  // the exact same generic polymorphic slice `mysqlListingRepository`
  // already uses for `mediable_type = 'listing'`, just a different value
  // in that same column; no new table) ---

  async listMedia(bookableUnitId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT m.*, mt.code AS media_type_code, mst.code AS moderation_status_code
       FROM media m
       JOIN media_types mt ON mt.id = m.media_type_id
       JOIN moderation_statuses mst ON mst.id = m.moderation_status_id
       WHERE m.mediable_type = 'bookable_unit' AND m.mediable_id = ? AND ${scopeActive('m')}
       ORDER BY m.position ASC, m.id ASC`,
      [bookableUnitId],
    );
    return rows.map(toMediaDomain);
  }

  async findMediaById(mediaId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT m.*, mt.code AS media_type_code, mst.code AS moderation_status_code
       FROM media m
       JOIN media_types mt ON mt.id = m.media_type_id
       JOIN moderation_statuses mst ON mst.id = m.moderation_status_id
       WHERE m.id = ? AND m.mediable_type = 'bookable_unit' AND ${scopeActive('m')}
       LIMIT 1`,
      [mediaId],
    );
    return rows[0] ? toMediaDomain(rows[0]) : null;
  }

  /**
   * Step L3.1 — mirrors `mysqlListingRepository.js#attachMedia` exactly:
   * `position`/`is_cover` are computed inside this single
   * `INSERT ... SELECT`, never read-then-written by the caller. Real
   * cross-request safety additionally requires the caller to open this
   * on a connection that already holds `lockById`'s row lock on the
   * parent `bookable_units` row as the transaction's first statement
   * (`AvailabilityService#attachUnitMedia`) — see that repository
   * method's own header for the full reasoning, identical here.
   */
  async attachMedia(
    {
      bookableUnitId,
      mediaTypeCode,
      url,
      mimeType,
      fileSizeBytes,
      ownerUserId,
    },
    connection = this.#pool,
  ) {
    const [[mediaType]] = await connection.query(
      'SELECT id FROM media_types WHERE code = ?',
      [mediaTypeCode],
    );
    const [[completedStatus]] = await connection.query(
      "SELECT id FROM media_upload_statuses WHERE code = 'COMPLETED'",
    );
    const [[pendingStatus]] = await connection.query(
      "SELECT id FROM moderation_statuses WHERE code = 'PENDING'",
    );

    try {
      const [result] = await connection.query(
        `INSERT INTO media
          (mediable_type, mediable_id, media_type_id, url, position, is_cover, upload_status_id, moderation_status_id, mime_type, file_size_bytes, owner_user_id, created_by, updated_by)
         SELECT 'bookable_unit', ?, ?, ?,
           COALESCE(MAX(m.position) + 1, 0),
           NOT EXISTS (
             SELECT 1 FROM media m2
             WHERE m2.mediable_type = 'bookable_unit' AND m2.mediable_id = ? AND m2.deleted_at IS NULL
           ),
           ?, ?, ?, ?, ?, ?, ?
         FROM media m
         WHERE m.mediable_type = 'bookable_unit' AND m.mediable_id = ? AND m.deleted_at IS NULL`,
        [
          bookableUnitId,
          mediaType.id,
          url,
          bookableUnitId,
          completedStatus.id,
          pendingStatus.id,
          mimeType,
          fileSizeBytes,
          ownerUserId,
          ownerUserId,
          ownerUserId,
          bookableUnitId,
        ],
      );
      return this.findMediaById(result.insertId, connection);
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  async removeMedia(mediaId, deletedByUserId, connection = this.#pool) {
    await connection.query(
      `UPDATE media SET ${softDeleteAssignment()}, deleted_by = ?, updated_by = ? WHERE id = ?`,
      [deletedByUserId, deletedByUserId, mediaId],
    );
  }
}

export default MySqlBookableUnitRepository;
