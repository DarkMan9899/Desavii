/**
 * MySQL implementation of the ListingRepository port.
 *
 * Owns `listings`, `listing_translations`, `listing_locations`,
 * `listing_category_listing`, `listing_amenity_listing`,
 * `listing_slug_history`, and the `mediable_type = 'listing'` slice of the
 * polymorphic `media` table (Module Catalog #7). Also owns a narrow
 * `partners`/`moderation_statuses` verification-status lookup
 * (`getPartnerVerification`) — a full Partners module doesn't exist yet, so
 * this stays scoped to exactly what listing creation needs, the same
 * precedent already set by `MySqlUserRepository.createAvatarMedia` for
 * media before a Media module existed.
 *
 * No single query joins the 1:N child tables (translations, media) with
 * the parent `listings` row — that would multiply rows and require
 * de-duplication in JS; separate targeted queries composed in `findById`
 * are simpler and equally correct for this foundation sprint.
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';
import { mapMysqlError } from '../../../infrastructure/database/errorMapping.js';
import {
  scopeActive,
  softDeleteAssignment,
} from '../../../infrastructure/database/softDelete.js';
import { scopePubliclyVisibleListing } from './listingVisibilitySql.js';
import {
  decodeCursor,
  buildPageMeta,
} from '../../../infrastructure/database/pagination.js';
import { ListingRepository as ListingRepositoryPort } from '../../../core/interfaces/ListingRepository.js';

/** One value table per non-enum primitive — mirrors the Generic Attribute Engine's own convention (see search's mysqlSearchRepository.js). */
const ATTRIBUTE_VALUE_TABLES = {
  INTEGER: 'listing_attribute_values_integer',
  DECIMAL: 'listing_attribute_values_decimal',
  BOOLEAN: 'listing_attribute_values_boolean',
  STRING: 'listing_attribute_values_string',
  DATE: 'listing_attribute_values_date',
};
const ENUM_ATTRIBUTE_DATA_TYPES = ['ENUM', 'MULTI_ENUM'];

const LISTING_SELECT_COLUMNS = `
  l.id, l.partner_id, l.listing_type_id, lt.code AS listing_type_code, l.slug,
  l.status_id, ls.code AS status_code, l.moderation_status_id, ms.code AS moderation_status_code,
  l.moderation_notes,
  l.is_contact_visible, l.is_featured, l.published_at, l.unpublished_at, l.archived_at,
  l.publication_period_days, l.expires_at, l.expiry_reminder_sent_at, l.frozen_at, l.purge_after, l.renewed_at,
  l.canonical_url, l.og_image_media_id, l.is_indexable, l.is_sitemap_included,
  l.created_at, l.updated_at, l.deleted_at, l.created_by, l.updated_by
`;
const FROM_LISTINGS_JOINED = `
  FROM listings l
  JOIN listing_types lt ON lt.id = l.listing_type_id
  JOIN listing_statuses ls ON ls.id = l.status_id
  JOIN moderation_statuses ms ON ms.id = l.moderation_status_id
`;

/**
 * Stage 11.3 (Admin Platform — Listing Moderation) admin list columns:
 * additive to `LISTING_SELECT_COLUMNS`, joining the owning partner's
 * display name and a correlated-subquery title (the primary translation
 * — same "pick one, correlated subquery" precedent
 * `mysqlPartnerRepository.js`'s `listing_count` already uses, scoped here
 * to a single row instead of a count).
 */
const ADMIN_SELECT_COLUMNS = `
  ${LISTING_SELECT_COLUMNS},
  p.display_name AS partner_display_name,
  (SELECT title FROM listing_translations WHERE listing_id = l.id ORDER BY language_id ASC LIMIT 1) AS title
`;
const ADMIN_FROM_JOINED = `
  ${FROM_LISTINGS_JOINED}
  JOIN partners p ON p.id = l.partner_id
`;

function toListingDomain(row) {
  if (!row) return null;
  return {
    id: row.id,
    partnerId: row.partner_id,
    listingTypeId: row.listing_type_id,
    listingTypeCode: row.listing_type_code,
    slug: row.slug,
    statusId: row.status_id,
    statusCode: row.status_code,
    moderationStatusId: row.moderation_status_id,
    moderationStatusCode: row.moderation_status_code,
    moderationNotes: row.moderation_notes,
    isContactVisible: Boolean(row.is_contact_visible),
    isFeatured: Boolean(row.is_featured),
    publishedAt: row.published_at,
    unpublishedAt: row.unpublished_at,
    archivedAt: row.archived_at,
    // Listing Lifetime / Renewal, Step B2 (foundation only — nothing yet
    // reads these outside the internal domain/repository layer; see
    // `core/domain/listingLifecycle.js`). Every one of these is `null` for
    // every listing until Step B3+ starts writing them.
    publicationPeriodDays: row.publication_period_days,
    expiresAt: row.expires_at,
    expiryReminderSentAt: row.expiry_reminder_sent_at,
    frozenAt: row.frozen_at,
    purgeAfter: row.purge_after,
    renewedAt: row.renewed_at,
    canonicalUrl: row.canonical_url,
    ogImageMediaId: row.og_image_media_id,
    isIndexable: Boolean(row.is_indexable),
    isSitemapIncluded: Boolean(row.is_sitemap_included),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

/** Stage 11.3 admin queue row — additive to `toListingDomain`, no child collections (translations/media/etc.) fetched, same "list row is lightweight" precedent as Partners' admin summary. */
function toAdminListingSummaryDomain(row) {
  return {
    ...toListingDomain(row),
    title: row.title,
    partnerDisplayName: row.partner_display_name,
  };
}

function toTranslationDomain(row) {
  return {
    id: row.id,
    listingId: row.listing_id,
    languageId: row.language_id,
    languageCode: row.language_code,
    title: row.title,
    summary: row.summary,
    description: row.description,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
  };
}

function toLocationDomain(row) {
  if (!row) return null;
  return {
    listingId: row.listing_id,
    addressId: row.address_id,
    cityId: row.city_id,
    cityName: row.city_name,
    countryName: row.country_name,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
  };
}

function toMediaDomain(row) {
  return {
    id: row.id,
    mediableType: row.mediable_type,
    mediableId: row.mediable_id,
    mediaTypeId: row.media_type_id,
    mediaTypeCode: row.media_type_code,
    url: row.url,
    thumbnailUrl: row.thumbnail_url,
    position: row.position,
    isCover: Boolean(row.is_cover),
    uploadStatusId: row.upload_status_id,
    moderationStatusId: row.moderation_status_id,
    moderationStatusCode: row.moderation_status_code,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    ownerUserId: row.owner_user_id,
    createdAt: row.created_at,
    altText: row.alt_text ?? null,
    caption: row.caption ?? null,
  };
}

export class MySqlListingRepository extends ListingRepositoryPort {
  #pool;

  constructor(pool = getMysqlPool()) {
    super();
    this.#pool = pool;
  }

  async insertListing(data, connection = this.#pool) {
    try {
      const [result] = await connection.query(
        `INSERT INTO listings
          (partner_id, listing_type_id, slug, status_id, moderation_status_id, is_contact_visible, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.partnerId,
          data.listingTypeId,
          data.slug,
          data.statusId,
          data.moderationStatusId,
          data.isContactVisible ?? false,
          data.createdBy,
          data.createdBy,
        ],
      );
      return result.insertId;
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  async insertTranslation(
    {
      listingId,
      languageId,
      title,
      summary = null,
      description = null,
      seoTitle = null,
      seoDescription = null,
    },
    connection = this.#pool,
  ) {
    try {
      await connection.query(
        `INSERT INTO listing_translations
          (listing_id, language_id, title, summary, description, seo_title, seo_description)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title), summary = VALUES(summary), description = VALUES(description),
           seo_title = VALUES(seo_title), seo_description = VALUES(seo_description)`,
        [
          listingId,
          languageId,
          title,
          summary,
          description,
          seoTitle,
          seoDescription,
        ],
      );
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  /**
   * A `PATCH /listings/:id` with a partial `location` (e.g. only
   * `{latitude, longitude}`, set once coordinates are known separately
   * from the city) must not erase fields it didn't mention — `COALESCE`
   * keeps each column's existing value whenever the caller didn't supply
   * a new one, on both the first insert (existing value doesn't exist
   * yet, so it's simply the provided default) and every later update.
   */
  async upsertLocation(
    {
      listingId,
      addressId = null,
      cityId = null,
      latitude = null,
      longitude = null,
    },
    connection = this.#pool,
  ) {
    try {
      await connection.query(
        `INSERT INTO listing_locations (listing_id, address_id, city_id, latitude, longitude)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           address_id = COALESCE(VALUES(address_id), address_id),
           city_id = COALESCE(VALUES(city_id), city_id),
           latitude = COALESCE(VALUES(latitude), latitude),
           longitude = COALESCE(VALUES(longitude), longitude)`,
        [listingId, addressId, cityId, latitude, longitude],
      );
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  async replaceCategoryLinks(
    listingId,
    categoryIds = [],
    connection = this.#pool,
  ) {
    await connection.query(
      'DELETE FROM listing_category_listing WHERE listing_id = ?',
      [listingId],
    );
    if (categoryIds.length === 0) return;
    const values = categoryIds.map((categoryId) => [listingId, categoryId]);
    try {
      await connection.query(
        'INSERT INTO listing_category_listing (listing_id, category_id) VALUES ?',
        [values],
      );
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  async replaceAmenityLinks(
    listingId,
    amenityIds = [],
    connection = this.#pool,
  ) {
    await connection.query(
      'DELETE FROM listing_amenity_listing WHERE listing_id = ?',
      [listingId],
    );
    if (amenityIds.length === 0) return;
    const values = amenityIds.map((amenityId) => [listingId, amenityId]);
    try {
      await connection.query(
        'INSERT INTO listing_amenity_listing (listing_id, amenity_id) VALUES ?',
        [values],
      );
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  /**
   * Writes attribute values onto a listing — the first code in this
   * codebase to INSERT into the Generic Attribute Engine's typed value
   * tables (previously read-only, only ever SELECTed by the search
   * module). `attributeValues` entries are pre-resolved by
   * `ListingService` (code -> `attributeDefinitionId`/`dataTypeCode`,
   * same resolution `SearchService.#resolveAttributeFilters` already does
   * for the read side) — this method only writes, never resolves.
   * ENUM/MULTI_ENUM entries carry `optionIds` (replace semantics, scoped
   * to that one attribute only); every other type carries a single
   * `value` (upsert semantics) into its matching typed table.
   */
  async replaceAttributeValues(
    listingId,
    attributeValues = [],
    connection = this.#pool,
  ) {
    try {
      // eslint-disable-next-line no-restricted-syntax -- sequential by design, same connection/transaction
      for (const entry of attributeValues) {
        if (ENUM_ATTRIBUTE_DATA_TYPES.includes(entry.dataTypeCode)) {
          // eslint-disable-next-line no-await-in-loop -- sequential by design
          await connection.query(
            `DELETE lao FROM listing_attribute_option lao
             JOIN attribute_options ao ON ao.id = lao.attribute_option_id
             WHERE lao.listing_id = ? AND ao.attribute_definition_id = ?`,
            [listingId, entry.attributeDefinitionId],
          );
          if (entry.optionIds.length > 0) {
            const values = entry.optionIds.map((optionId) => [
              listingId,
              optionId,
            ]);
            // eslint-disable-next-line no-await-in-loop -- sequential by design
            await connection.query(
              'INSERT INTO listing_attribute_option (listing_id, attribute_option_id) VALUES ?',
              [values],
            );
          }
        } else {
          const table = ATTRIBUTE_VALUE_TABLES[entry.dataTypeCode];
          // eslint-disable-next-line no-await-in-loop -- sequential by design
          await connection.query(
            `INSERT INTO ${table} (listing_id, attribute_definition_id, value)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value)`,
            [listingId, entry.attributeDefinitionId, entry.value],
          );
        }
      }
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  /** One flexible string value per (listing, policy) — see migration 0015's header for why this is untyped, unlike attribute values. */
  async replacePolicyValues(
    listingId,
    policyValues = [],
    connection = this.#pool,
  ) {
    try {
      // eslint-disable-next-line no-restricted-syntax -- sequential by design, same connection/transaction
      for (const entry of policyValues) {
        // eslint-disable-next-line no-await-in-loop -- sequential by design
        await connection.query(
          `INSERT INTO listing_policy_values (listing_id, policy_definition_id, value)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE value = VALUES(value)`,
          [listingId, entry.policyDefinitionId, entry.value],
        );
      }
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  async upsertPricing(
    listingId,
    { pricingModelId, amount, currencyId },
    connection = this.#pool,
  ) {
    try {
      await connection.query(
        `INSERT INTO listing_pricing (listing_id, pricing_model_id, amount, currency_id)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           pricing_model_id = VALUES(pricing_model_id), amount = VALUES(amount), currency_id = VALUES(currency_id)`,
        [listingId, pricingModelId, amount, currencyId],
      );
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  /** COALESCE-based partial update — same rationale as `upsertLocation` above (an omitted field must not erase a previously-set one). */
  async upsertBookingRules(
    listingId,
    {
      minimumStayNights = null,
      maximumStayNights = null,
      advanceBookingMinHours = null,
      advanceBookingMaxDays = null,
    } = {},
    connection = this.#pool,
  ) {
    try {
      await connection.query(
        `INSERT INTO listing_booking_rules
           (listing_id, minimum_stay_nights, maximum_stay_nights, advance_booking_min_hours, advance_booking_max_days)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           minimum_stay_nights = COALESCE(VALUES(minimum_stay_nights), minimum_stay_nights),
           maximum_stay_nights = COALESCE(VALUES(maximum_stay_nights), maximum_stay_nights),
           advance_booking_min_hours = COALESCE(VALUES(advance_booking_min_hours), advance_booking_min_hours),
           advance_booking_max_days = COALESCE(VALUES(advance_booking_max_days), advance_booking_max_days)`,
        [
          listingId,
          minimumStayNights,
          maximumStayNights,
          advanceBookingMinHours,
          advanceBookingMaxDays,
        ],
      );
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  /**
   * Unified read across all 5 typed tables + the ENUM/MULTI_ENUM option
   * table, one entry per attribute keyed by `code` (not the internal id)
   * — the wizard only ever deals in codes (same convention as the write
   * side and `GET /listings/metadata`), never attribute_definition_id.
   * `optionCodes` for enum types, `value` otherwise.
   */
  async getAttributeValues(listingId, connection = this.#pool) {
    const [
      [intRows],
      [decRows],
      [boolRows],
      [strRows],
      [dateRows],
      [optionRows],
    ] = await Promise.all([
      connection.query(
        `SELECT ad.code, v.value FROM listing_attribute_values_integer v
           JOIN attribute_definitions ad ON ad.id = v.attribute_definition_id
           WHERE v.listing_id = ?`,
        [listingId],
      ),
      connection.query(
        `SELECT ad.code, v.value FROM listing_attribute_values_decimal v
           JOIN attribute_definitions ad ON ad.id = v.attribute_definition_id
           WHERE v.listing_id = ?`,
        [listingId],
      ),
      connection.query(
        `SELECT ad.code, v.value FROM listing_attribute_values_boolean v
           JOIN attribute_definitions ad ON ad.id = v.attribute_definition_id
           WHERE v.listing_id = ?`,
        [listingId],
      ),
      connection.query(
        `SELECT ad.code, v.value FROM listing_attribute_values_string v
           JOIN attribute_definitions ad ON ad.id = v.attribute_definition_id
           WHERE v.listing_id = ?`,
        [listingId],
      ),
      connection.query(
        `SELECT ad.code, v.value FROM listing_attribute_values_date v
           JOIN attribute_definitions ad ON ad.id = v.attribute_definition_id
           WHERE v.listing_id = ?`,
        [listingId],
      ),
      connection.query(
        `SELECT ad.code, ao.code AS option_code
           FROM listing_attribute_option lao
           JOIN attribute_options ao ON ao.id = lao.attribute_option_id
           JOIN attribute_definitions ad ON ad.id = ao.attribute_definition_id
           WHERE lao.listing_id = ?`,
        [listingId],
      ),
    ]);

    const values = [
      ...intRows.map((row) => ({ code: row.code, value: row.value })),
      ...decRows.map((row) => ({ code: row.code, value: Number(row.value) })),
      ...boolRows.map((row) => ({ code: row.code, value: Boolean(row.value) })),
      ...strRows.map((row) => ({ code: row.code, value: row.value })),
      ...dateRows.map((row) => ({ code: row.code, value: row.value })),
    ];

    const optionCodesByAttributeCode = new Map();
    optionRows.forEach((row) => {
      if (!optionCodesByAttributeCode.has(row.code)) {
        optionCodesByAttributeCode.set(row.code, []);
      }
      optionCodesByAttributeCode.get(row.code).push(row.option_code);
    });
    optionCodesByAttributeCode.forEach((optionCodes, code) => {
      values.push({ code, optionCodes });
    });

    return values;
  }

  async getPolicyValues(listingId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT pd.code, v.value FROM listing_policy_values v
       JOIN policy_definitions pd ON pd.id = v.policy_definition_id
       WHERE v.listing_id = ?`,
      [listingId],
    );
    return rows.map((row) => ({ code: row.code, value: row.value }));
  }

  async getPricing(listingId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT pm.code AS pricing_model_code, p.amount, c.code AS currency_code
       FROM listing_pricing p
       JOIN pricing_models pm ON pm.id = p.pricing_model_id
       JOIN currencies c ON c.id = p.currency_id
       WHERE p.listing_id = ? LIMIT 1`,
      [listingId],
    );
    if (rows.length === 0) return null;
    return {
      pricingModelCode: rows[0].pricing_model_code,
      amount: Number(rows[0].amount),
      currencyCode: rows[0].currency_code,
    };
  }

  async getBookingRules(listingId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT minimum_stay_nights, maximum_stay_nights, advance_booking_min_hours, advance_booking_max_days
       FROM listing_booking_rules WHERE listing_id = ? LIMIT 1`,
      [listingId],
    );
    if (rows.length === 0) return null;
    return {
      minimumStayNights: rows[0].minimum_stay_nights,
      maximumStayNights: rows[0].maximum_stay_nights,
      advanceBookingMinHours: rows[0].advance_booking_min_hours,
      advanceBookingMaxDays: rows[0].advance_booking_max_days,
    };
  }

  async recordSlugHistory(listingId, oldSlug, connection = this.#pool) {
    await connection.query(
      'INSERT INTO listing_slug_history (listing_id, old_slug) VALUES (?, ?)',
      [listingId, oldSlug],
    );
  }

  async findById(id, { includeTrashed = false } = {}, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT ${LISTING_SELECT_COLUMNS} ${FROM_LISTINGS_JOINED} WHERE l.id = ? AND ${scopeActive('l', { includeTrashed })} LIMIT 1`,
      [id],
    );
    const listing = toListingDomain(rows[0]);
    if (!listing) return null;
    return this.#assembleListing(listing, connection);
  }

  /**
   * Phase 20 (SEO): shared by `findById` and `findBySlug` — both resolve
   * the same base row shape (just a different WHERE clause) and then need
   * the identical set of nested collections (translations/location/media/
   * attributes/pricing/etc.), all keyed off the resolved numeric `id`.
   * Extracted so `findBySlug` (previously a stub that returned only the
   * bare row — never actually called anywhere until Phase 20 wired the
   * public GET route to accept a slug, at which point it surfaced as a
   * real 500) assembles a genuinely complete domain object, identical in
   * shape to `findById`'s.
   */
  async #assembleListing(listing, connection) {
    const { id } = listing;
    const [
      [translationRows],
      [locationRows],
      [categoryRows],
      [amenityRows],
      mediaRows,
      attributeValues,
      policyValues,
      pricing,
      bookingRules,
      [reviewSummaryRows],
      highlights,
      itinerarySteps,
      includedItems,
      faqs,
      company,
    ] = await Promise.all([
      connection.query(
        `SELECT lt.*, lang.code AS language_code
         FROM listing_translations lt
         LEFT JOIN languages lang ON lang.id = lt.language_id
         WHERE lt.listing_id = ?`,
        [id],
      ),
      connection.query(
        `SELECT ll.*, c.name AS city_name, co.name AS country_name
         FROM listing_locations ll
         LEFT JOIN cities c ON c.id = ll.city_id
         LEFT JOIN regions r ON r.id = c.region_id
         LEFT JOIN countries co ON co.id = r.country_id
         WHERE ll.listing_id = ? LIMIT 1`,
        [id],
      ),
      connection.query(
        'SELECT category_id FROM listing_category_listing WHERE listing_id = ?',
        [id],
      ),
      connection.query(
        'SELECT amenity_id FROM listing_amenity_listing WHERE listing_id = ?',
        [id],
      ),
      this.listMedia(id, connection),
      this.getAttributeValues(id, connection),
      this.getPolicyValues(id, connection),
      this.getPricing(id, connection),
      this.getBookingRules(id, connection),
      // Phase 12 (Product Polish): read-only rating aggregate. Not a
      // second Repository over `reviews`' write path (all review
      // writes/moderation still go exclusively through ReviewService) —
      // this mirrors how this method already denormalizes reads across
      // tables owned elsewhere (translations/location joins above).
      connection.query(
        `SELECT AVG(rv.rating) AS rating_average, COUNT(*) AS review_count
         FROM reviews rv
         JOIN moderation_statuses rs ON rs.id = rv.status_id
         WHERE rv.listing_id = ? AND rs.code = 'APPROVED' AND rv.deleted_at IS NULL`,
        [id],
      ),
      this.listHighlights(id, connection),
      this.listItinerarySteps(id, connection),
      this.listIncludedItems(id, connection),
      this.listFaqs(id, connection),
      this.getPublicCompanySummary(listing.partnerId, connection),
    ]);

    const reviewSummaryRow = reviewSummaryRows[0];

    return {
      ...listing,
      translations: translationRows.map(toTranslationDomain),
      location: toLocationDomain(locationRows[0]),
      categoryIds: categoryRows.map((row) => row.category_id),
      amenityIds: amenityRows.map((row) => row.amenity_id),
      media: mediaRows,
      attributeValues,
      policyValues,
      pricing,
      bookingRules,
      ratingAverage: reviewSummaryRow?.rating_average
        ? Number(reviewSummaryRow.rating_average)
        : null,
      reviewCount: reviewSummaryRow?.review_count ?? 0,
      highlights,
      itinerarySteps,
      includedItems,
      faqs,
      company,
    };
  }

  async findBySlug(slug, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT ${LISTING_SELECT_COLUMNS} ${FROM_LISTINGS_JOINED} WHERE l.slug = ? AND ${scopeActive('l')} LIMIT 1`,
      [slug],
    );
    const listing = toListingDomain(rows[0]);
    if (!listing) return null;
    return this.#assembleListing(listing, connection);
  }

  async slugExists(slug, { excludeId = null } = {}, connection = this.#pool) {
    const conditions = ['active_slug = ?'];
    const params = [slug];
    if (excludeId !== null) {
      conditions.push('id != ?');
      params.push(excludeId);
    }
    const [rows] = await connection.query(
      `SELECT id FROM listings WHERE ${conditions.join(' AND ')} LIMIT 1`,
      params,
    );
    return rows.length > 0;
  }

  async list(
    filters = {},
    { cursor = null, limit = 20 } = {},
    connection = this.#pool,
  ) {
    const conditions = [scopeActive('l')];
    const params = [];

    if (filters.partnerId !== undefined) {
      conditions.push('l.partner_id = ?');
      params.push(filters.partnerId);
    }
    if (filters.listingTypeCode !== undefined) {
      conditions.push('lt.code = ?');
      params.push(filters.listingTypeCode);
    }
    if (filters.statusCode !== undefined) {
      conditions.push('ls.code = ?');
      params.push(filters.statusCode);
    } else if (filters.onlyPublished) {
      // Step B4: a public/anonymous caller must never see an
      // expired/frozen listing here either, on the same "expiry sweep
      // is a convenience sync, not the sole authority" rule every other
      // public read now applies.
      conditions.push(scopePubliclyVisibleListing());
    }

    const decoded = decodeCursor(cursor);
    if (decoded?.id) {
      conditions.push('l.id < ?');
      params.push(decoded.id);
    }

    const [rows] = await connection.query(
      `SELECT ${LISTING_SELECT_COLUMNS} ${FROM_LISTINGS_JOINED}
       WHERE ${conditions.join(' AND ')}
       ORDER BY l.id DESC
       LIMIT ?`,
      [...params, limit + 1],
    );

    const { rows: pageRows, meta } = buildPageMeta(rows, limit, (row) => ({
      id: row.id,
    }));
    return { rows: pageRows.map(toListingDomain), meta };
  }

  /**
   * Stage 11.3 (Admin Platform — Listing Moderation) admin queue — every
   * listing regardless of owner or publish status, unlike `list()` above
   * (which requires an owner/permission match on an explicit `partnerId`
   * to see anything beyond PUBLISHED). Keyword matches the listing's
   * primary title or the owning partner's display name.
   * @param {{keyword?: string, moderationStatus?: string, status?: string, cursor?: string|null, limit?: number}} [opts]
   */
  async listAdmin({
    keyword,
    moderationStatus,
    status,
    cursor = null,
    limit = 20,
  } = {}) {
    const conditions = [scopeActive('l')];
    const params = [];

    if (keyword) {
      conditions.push(
        `(p.display_name LIKE ?
          OR (SELECT title FROM listing_translations WHERE listing_id = l.id ORDER BY language_id ASC LIMIT 1) LIKE ?)`,
      );
      const pattern = `%${keyword}%`;
      params.push(pattern, pattern);
    }
    if (moderationStatus) {
      conditions.push('ms.code = ?');
      params.push(moderationStatus);
    }
    if (status) {
      conditions.push('ls.code = ?');
      params.push(status);
    }

    const decoded = decodeCursor(cursor);
    if (decoded?.id) {
      conditions.push('l.id < ?');
      params.push(decoded.id);
    }

    const [rows] = await this.#pool.query(
      `SELECT ${ADMIN_SELECT_COLUMNS} ${ADMIN_FROM_JOINED}
       WHERE ${conditions.join(' AND ')}
       ORDER BY l.id DESC
       LIMIT ?`,
      [...params, limit + 1],
    );

    const { rows: pageRows, meta } = buildPageMeta(rows, limit, (row) => ({
      id: row.id,
    }));
    return { rows: pageRows.map(toAdminListingSummaryDomain), meta };
  }

  /**
   * @param {number} id
   * @param {string} statusCode PENDING|APPROVED|REJECTED|FLAGGED
   * @param {string|null} notes
   * @param {number} updatedBy
   */
  async updateModerationStatus(id, statusCode, notes, updatedBy) {
    await this.#pool.query(
      `UPDATE listings
       SET moderation_status_id = (SELECT id FROM moderation_statuses WHERE code = ?),
           moderation_notes = ?,
           updated_by = ?
       WHERE id = ?`,
      [statusCode, notes, updatedBy, id],
    );
  }

  async update(id, fields, connection = this.#pool) {
    const columnMap = {
      canonicalUrl: 'canonical_url',
      ogImageMediaId: 'og_image_media_id',
      isIndexable: 'is_indexable',
      isSitemapIncluded: 'is_sitemap_included',
      isContactVisible: 'is_contact_visible',
      slug: 'slug',
      updatedBy: 'updated_by',
    };

    const assignments = [];
    const values = [];
    Object.entries(fields).forEach(([key, value]) => {
      const column = columnMap[key];
      if (column && value !== undefined) {
        assignments.push(`${column} = ?`);
        values.push(value);
      }
    });

    if (assignments.length > 0) {
      try {
        await connection.query(
          `UPDATE listings SET ${assignments.join(', ')} WHERE id = ?`,
          [...values, id],
        );
      } catch (err) {
        throw mapMysqlError(err);
      }
    }
  }

  /**
   * `published_at`/`unpublished_at` use the DB-side `UTC_TIMESTAMP(3)`
   * (same convention as `updateLastLoginAt` in mysqlUserRepository.js)
   * rather than an app-side `Date`, avoiding app/DB clock skew.
   * Unpublishing intentionally leaves `published_at` untouched — it
   * records the most recent publish moment, not "currently published."
   */
  /**
   * @param {number} id
   * @param {number} statusId
   * @param {number} updatedBy
   * @param {number|null} [publicationPeriodDays] Listing Lifetime / Renewal,
   *   Step B3: non-null ONLY on a listing's first lifecycle-managed
   *   publish (the Service layer decides this from `listing.expiresAt`
   *   before calling in — never re-derived here). When non-null, this
   *   single UPDATE atomically assigns the new publication cycle in the
   *   same statement as the status transition — `UTC_TIMESTAMP(3)` is
   *   evaluated once per SQL statement in MySQL, so `published_at` and
   *   `expires_at` are always computed from the identical instant, no
   *   separate query/round-trip that could partially fail. `null` (an
   *   ordinary republish of an already-lifecycle-managed listing) leaves
   *   every lifecycle column exactly as it was — an unpublish/republish
   *   cycle must never silently grant a fresh publication period.
   */
  async markPublished(
    id,
    statusId,
    updatedBy,
    publicationPeriodDays = null,
    connection = this.#pool,
  ) {
    if (publicationPeriodDays != null) {
      await connection.query(
        `UPDATE listings
         SET status_id = ?, published_at = UTC_TIMESTAMP(3), unpublished_at = NULL, updated_by = ?,
             publication_period_days = ?,
             expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? DAY),
             expiry_reminder_sent_at = NULL, frozen_at = NULL, purge_after = NULL
         WHERE id = ?`,
        [statusId, updatedBy, publicationPeriodDays, publicationPeriodDays, id],
      );
      return;
    }
    await connection.query(
      `UPDATE listings
       SET status_id = ?, published_at = UTC_TIMESTAMP(3), unpublished_at = NULL, updated_by = ?
       WHERE id = ?`,
      [statusId, updatedBy, id],
    );
  }

  async markUnpublished(id, statusId, updatedBy, connection = this.#pool) {
    await connection.query(
      `UPDATE listings
       SET status_id = ?, unpublished_at = UTC_TIMESTAMP(3), updated_by = ?
       WHERE id = ?`,
      [statusId, updatedBy, id],
    );
  }

  async markArchived(id, statusId, updatedBy, connection = this.#pool) {
    await connection.query(
      `UPDATE listings
       SET status_id = ?, archived_at = UTC_TIMESTAMP(3), updated_by = ?
       WHERE id = ?`,
      [statusId, updatedBy, id],
    );
  }

  /**
   * Listing Lifetime / Renewal, Step B6.5 — the one authoritative lifecycle
   * clock read. Every guarded UPDATE in this file (`freezeExpiredListings`,
   * `extendActivePublication`, `reactivateExpiredPublication`,
   * `claimExpiryReminder`) already decides eligibility entirely in SQL via
   * `UTC_TIMESTAMP(3)`, immune to any JS-side timezone quirk. The domain
   * layer's own `hasLifecycleExpired`/`isPubliclyVisible` (used for READ-
   * path decisions that never go through a guarded UPDATE — `getListing`'s
   * public-detail gate, `assertBookable`, and `renewListing`'s branch
   * selection) need the exact same authoritative instant, sourced through
   * this SAME connection, so their `new Date(expiresAt) <= now` comparison
   * lives in one consistent time frame instead of mixing a mysql2-parsed
   * value against a plain JS clock read.
   * @returns {Promise<Date>}
   */
  async findDbNow(connection = this.#pool) {
    const [[row]] = await connection.query('SELECT UTC_TIMESTAMP(3) AS now');
    return row.now;
  }

  /**
   * Listing Lifetime / Renewal, Step B4 — the scheduled expiry sweep's
   * only write. One guarded UPDATE, not a per-row loop: the WHERE clause
   * (still PUBLISHED, not already frozen, has a real `expires_at`, and it
   * has already passed) is exactly what makes this naturally idempotent —
   * running it twice, or two overlapping sweep workers racing on the same
   * row, both converge on mutating a given row at most once, since the
   * second attempt's WHERE clause no longer matches once the first has
   * already flipped `status_id` away from PUBLISHED. No separate advisory
   * lock needed; MySQL's own row-level locking on the UPDATE already
   * serializes two truly-concurrent attempts at the same row.
   *
   * `updated_by` is explicitly set to `NULL` (never left as whatever it
   * was before) — this is a system-initiated transition, not a user
   * action, mirroring `AdvertisementService#runLifecycleSweep`'s own
   * `updatedBy: null` convention for its scheduled status transitions.
   * `purge_after` uses `INTERVAL 6 MONTH` (real calendar-month arithmetic,
   * never approximated as 180 days) per the product's six-calendar-month
   * retention rule. Every other column — `publication_period_days`,
   * `expires_at`, `published_at`, `moderation_status_id`, content, slug —
   * is left completely untouched.
   *
   * @param {{publishedStatusId: number, unpublishedStatusId: number}} ids
   * @returns {Promise<number>} how many listings this run froze
   */
  async freezeExpiredListings(
    { publishedStatusId, unpublishedStatusId },
    connection = this.#pool,
  ) {
    const [result] = await connection.query(
      `UPDATE listings
       SET status_id = ?, frozen_at = UTC_TIMESTAMP(3),
           purge_after = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 6 MONTH),
           updated_by = NULL
       WHERE status_id = ? AND deleted_at IS NULL AND frozen_at IS NULL
         AND expires_at IS NOT NULL AND expires_at <= UTC_TIMESTAMP(3)`,
      [unpublishedStatusId, publishedStatusId],
    );
    return result.affectedRows;
  }

  /**
   * Listing Lifetime / Renewal, Step B6 — read-only candidate list for the
   * sweep's reminder phase (brief §12's exact T-2 window, DB time only):
   * still PUBLISHED, not frozen, not deleted, has a real `expires_at`
   * that's still in the future but falls within the next 2 days, and has
   * never been reminded this cycle. Deliberately does NOT itself claim
   * anything — `runExpirySweep` claims each candidate individually via
   * `claimExpiryReminder` before publishing its event, so a row read here
   * that a concurrent sweep/claim already took is simply skipped later,
   * never double-sent (see that method's own doc comment).
   *
   * `title` is resolved via the exact same requested-locale-then-default
   * COALESCE fallback `mysqlSearchRepository.js` already uses for public
   * card titles — here "requested locale" is always the platform default
   * (a background sweep has no per-request locale), so `lt`/`lt2` both
   * join on `defaultLanguageId`; the COALESCE only guards the rare case
   * where even the default-language translation row is missing, so the
   * reminder can never carry a blank listing name (brief §20).
   *
   * @param {{publishedStatusId: number, defaultLanguageId: number}} args
   * @returns {Promise<Array<{id: number, partnerId: number, slug: string, title: string, expiresAt: Date}>>}
   */
  async listDueForReminder(
    { publishedStatusId, defaultLanguageId },
    connection = this.#pool,
  ) {
    const [rows] = await connection.query(
      `SELECT l.id, l.partner_id, l.slug, l.expires_at,
              COALESCE(lt.title, '') AS title
       FROM listings l
       LEFT JOIN listing_translations lt
         ON lt.listing_id = l.id AND lt.language_id = ?
       WHERE l.status_id = ? AND l.deleted_at IS NULL AND l.frozen_at IS NULL
         AND l.expiry_reminder_sent_at IS NULL
         AND l.expires_at IS NOT NULL
         AND l.expires_at > UTC_TIMESTAMP(3)
         AND l.expires_at <= DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 2 DAY)`,
      [defaultLanguageId, publishedStatusId],
    );
    return rows.map((row) => ({
      id: row.id,
      partnerId: row.partner_id,
      slug: row.slug,
      title: row.title,
      expiresAt: row.expires_at,
    }));
  }

  /**
   * Listing Lifetime / Renewal, Step B6 — the reminder sweep's only write,
   * one row at a time (unlike `freezeExpiredListings`'s single bulk
   * UPDATE) because each successful claim gates one outbound domain-event
   * publish; a bulk UPDATE could claim N rows in one statement with no
   * per-row signal to drive N separate `#eventBus.publish` calls from.
   *
   * This is the safe claim/guarded-update strategy brief §14 explicitly
   * asks for, and deliberately NOT a copy of `AdvertisementRepository
   * .markReminderSent`'s own unconditional `UPDATE ... WHERE id = ?`
   * (no precondition re-check at write time — two overlapping sweep runs
   * that both read the same row via `listDueForReminder` could both then
   * unconditionally mark it and both publish, a genuine duplicate-reminder
   * race in that existing implementation). Every precondition
   * `listDueForReminder`'s SELECT used is re-validated here, fresh, at
   * UPDATE time: only a row that STILL matches every condition (still
   * PUBLISHED, still not frozen/deleted, still genuinely inside the T-2
   * window, and still never reminded) gets claimed. Two overlapping
   * callers racing the same row converge on exactly one successful claim —
   * MySQL's own row-level locking serializes the two UPDATEs, and whichever
   * runs second finds the WHERE clause no longer matches (`expiry_reminder
   * _sent_at` is no longer NULL) and affects zero rows. The caller
   * (`ListingService#runExpirySweep`) only publishes the event when this
   * returns 1, never when it returns 0 — claim-then-publish, never the
   * reverse, so no worker can ever publish before the row is durably
   * marked.
   *
   * Also the mechanism behind brief §18/§19's expiry-race and renew-race
   * requirements: if the expiry sweep's `freezeExpiredListings` (or a
   * concurrent `renewListing`) commits first, this row no longer satisfies
   * `status_id = ? AND frozen_at IS NULL` (frozen) or `expires_at <= NOW()
   * + 2 DAY` (renewed to a far-future expiry, or `expiry_reminder_sent_at`
   * already reset to NULL by the renewal but with a new, no-longer-T-2
   * `expires_at`) — either way this claim matches zero rows and no stale
   * "expires in 2 days" reminder is ever sent for the old cycle.
   *
   * @param {{id: number, publishedStatusId: number}} args
   * @returns {Promise<number>} 0 or 1 — 0 means the state changed
   *   concurrently (already reminded, frozen, deleted, renewed, or no
   *   longer inside the T-2 window) and nothing was written/published.
   */
  async claimExpiryReminder(
    { id, publishedStatusId },
    connection = this.#pool,
  ) {
    const [result] = await connection.query(
      `UPDATE listings
       SET expiry_reminder_sent_at = UTC_TIMESTAMP(3)
       WHERE id = ? AND status_id = ? AND deleted_at IS NULL AND frozen_at IS NULL
         AND expiry_reminder_sent_at IS NULL
         AND expires_at IS NOT NULL
         AND expires_at > UTC_TIMESTAMP(3)
         AND expires_at <= DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 2 DAY)`,
      [id, publishedStatusId],
    );
    return result.affectedRows;
  }

  /**
   * Listing Lifetime / Renewal, Step B7 — the retention-purge sweep's only
   * write: the final, canonical soft-delete (`deleted_at = UTC_TIMESTAMP(3)`,
   * the exact same `softDeleteAssignment()` fragment `deleteListing` uses)
   * for a listing that has sat frozen past its 6-calendar-month retention
   * window without ever being renewed. One guarded bulk UPDATE, not a
   * per-row loop — unlike `claimExpiryReminder` above, purging never needs
   * to drive a per-row side effect (no event to publish, no notification to
   * send; brief explicitly excludes any of that from B7), so there is
   * nothing here that a bulk `freezeExpiredListings`-shaped UPDATE can't
   * already do in one statement.
   *
   * The WHERE clause IS the eligibility rule (brief §2/§6), re-validated
   * fresh at write time exactly like every other guarded lifecycle UPDATE
   * in this file: still not deleted, still genuinely UNPUBLISHED, still
   * frozen, still has a `purge_after`, and it has passed. This is what
   * makes the Renew-vs-Purge race resolve correctly with no new mechanism
   * needed — `reactivateExpiredPublication`/`extendActivePublication`
   * (Step B5) already clear `frozen_at`/`purge_after` back to NULL on a
   * successful renewal, so if Renew commits first this UPDATE's own
   * `frozen_at IS NOT NULL AND purge_after IS NOT NULL` no longer matches
   * and affects zero rows; conversely, `extendActivePublication`/
   * `reactivateExpiredPublication` already guard on `deleted_at IS NULL`,
   * so if this UPDATE commits first, a concurrent Renew attempt matches
   * zero rows there instead — MySQL's own row-level locking serializes
   * the two, so there is no interleaving that leaves a listing both
   * PUBLISHED and soft-deleted, or deleted-then-resurrected.
   *
   * `deleted_by`/`updated_by` are explicitly `NULL` — system-initiated,
   * mirroring `freezeExpiredListings`'s own `updatedBy: null` convention
   * for every other scheduled lifecycle transition in this file. No
   * dependent table (bookings/payments/reviews/favorites/promotions/
   * translations/media) is touched — the listing row itself is the only
   * thing this UPDATE ever writes.
   *
   * @param {{unpublishedStatusId: number}} args
   * @returns {Promise<number>} how many listings this run purged
   */
  async purgeRetiredListings({ unpublishedStatusId }, connection = this.#pool) {
    const [result] = await connection.query(
      `UPDATE listings
       SET ${softDeleteAssignment()}, deleted_by = NULL, updated_by = NULL
       WHERE deleted_at IS NULL AND status_id = ? AND frozen_at IS NOT NULL
         AND purge_after IS NOT NULL AND purge_after <= UTC_TIMESTAMP(3)`,
      [unpublishedStatusId],
    );
    return result.affectedRows;
  }

  /**
   * Listing Lifetime / Renewal, Step B5 — the ACTIVE-renewal path: a
   * listing that is still genuinely PUBLISHED and not yet expired, renewed
   * BEFORE its current period runs out. Extends from the listing's own
   * CURRENT `expires_at` (never `NOW()`) — a partner renewing 10 days
   * before expiry with a 90-day period ends up with 100 days remaining,
   * never 90 (brief's own explicit example). `status_id`/`frozen_at`/
   * `purge_after` are untouched — nothing about the listing's PUBLISHED
   * state changes, this only extends the existing publication period.
   *
   * Double-renew / race safety (brief §13, documented choice — no new
   * migration, so no dedicated idempotency-key column): the WHERE clause
   * re-validates every ACTIVE-eligibility condition at UPDATE time (not
   * trusting the Service's earlier read), so a listing the expiry sweep
   * concurrently froze between that read and this UPDATE simply matches
   * zero rows here instead of corrupting state. The trailing `renewed_at`
   * debounce clause is the "duplicate HTTP request" guard specifically:
   * MySQL's own row-level locking already serializes two truly-
   * simultaneous UPDATE attempts on the same row, but the SECOND one,
   * once unblocked, would otherwise still see the row as freshly extended
   * by the first and match again — the 3-second window (comfortably above
   * real double-click/network-retry timing, comfortably below any
   * deliberate distinct renewal) is what actually stops that second
   * attempt from matching, a "row state/timestamp guard" per the brief's
   * own explicitly-sanctioned alternative to a dedicated idempotency-key
   * table.
   *
   * @param {{id: number, publishedStatusId: number, publicationPeriodDays: number, updatedBy: number}} args
   * @returns {Promise<number>} 0 or 1 — 0 means the state changed
   *   concurrently (already frozen, already renewed moments ago, expired,
   *   or no longer PUBLISHED) and nothing was written.
   */
  async extendActivePublication(
    { id, publishedStatusId, publicationPeriodDays, updatedBy },
    connection = this.#pool,
  ) {
    const [result] = await connection.query(
      `UPDATE listings
       SET publication_period_days = ?,
           expires_at = DATE_ADD(expires_at, INTERVAL ? DAY),
           renewed_at = UTC_TIMESTAMP(3),
           expiry_reminder_sent_at = NULL,
           updated_by = ?
       WHERE id = ? AND deleted_at IS NULL AND frozen_at IS NULL
         AND status_id = ? AND expires_at IS NOT NULL AND expires_at > UTC_TIMESTAMP(3)
         AND (renewed_at IS NULL OR renewed_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 3 SECOND))`,
      [
        publicationPeriodDays,
        publicationPeriodDays,
        updatedBy,
        id,
        publishedStatusId,
      ],
    );
    return result.affectedRows;
  }

  /**
   * Listing Lifetime / Renewal, Step B5 — the FROZEN-renewal path, basis
   * `NOW()` (never the old, already-passed `expires_at`). Also covers the
   * up-to-an-hour window where a listing's `expires_at` has already
   * passed but the hourly sweep (`freezeExpiredListings`) hasn't yet
   * flipped it to UNPUBLISHED/`frozen_at` — the second WHERE branch below
   * (`status_id = ? AND expires_at <= NOW()`) matches that state directly,
   * so a partner renewing in that gap gets the correct NOW()-based expiry
   * regardless of whether the sweep or this renewal wins the race; if the
   * sweep DOES run first, the row simply satisfies the OTHER branch
   * (`frozen_at IS NOT NULL`) instead — either way this UPDATE still
   * matches exactly once. `status_id` is set to PUBLISHED unconditionally
   * (a no-op when the row was still PUBLISHED-but-unswept); `frozen_at`/
   * `purge_after` are cleared unconditionally (already NULL in that same
   * case). Same double-renew debounce clause as `extendActivePublication`
   * — see that method's own doc comment for the full reasoning.
   *
   * @param {{id: number, publishedStatusId: number, publicationPeriodDays: number, updatedBy: number}} args
   * @returns {Promise<number>} 0 or 1 — 0 means the state changed
   *   concurrently (already renewed moments ago, deleted, or no longer
   *   eligible) and nothing was written.
   */
  async reactivateExpiredPublication(
    { id, publishedStatusId, publicationPeriodDays, updatedBy },
    connection = this.#pool,
  ) {
    const [result] = await connection.query(
      `UPDATE listings
       SET status_id = ?, publication_period_days = ?,
           expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? DAY),
           renewed_at = UTC_TIMESTAMP(3),
           expiry_reminder_sent_at = NULL,
           frozen_at = NULL, purge_after = NULL,
           updated_by = ?
       WHERE id = ? AND deleted_at IS NULL
         AND (
           frozen_at IS NOT NULL
           OR (status_id = ? AND expires_at IS NOT NULL AND expires_at <= UTC_TIMESTAMP(3))
         )
         AND (renewed_at IS NULL OR renewed_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 3 SECOND))`,
      [
        publishedStatusId,
        publicationPeriodDays,
        publicationPeriodDays,
        updatedBy,
        id,
        publishedStatusId,
      ],
    );
    return result.affectedRows;
  }

  async softDelete(id, deletedByUserId, connection = this.#pool) {
    await connection.query(
      `UPDATE listings SET ${softDeleteAssignment()}, deleted_by = ?, updated_by = ? WHERE id = ?`,
      [deletedByUserId, deletedByUserId, id],
    );
  }

  async listMedia(listingId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT m.*, mt.code AS media_type_code, mst.code AS moderation_status_code,
              trans.alt_text, trans.caption
       FROM media m
       JOIN media_types mt ON mt.id = m.media_type_id
       JOIN moderation_statuses mst ON mst.id = m.moderation_status_id
       LEFT JOIN media_translations trans
         ON trans.media_id = m.id
         AND trans.language_id = (SELECT id FROM languages WHERE is_default = 1 LIMIT 1)
       WHERE m.mediable_type = 'listing' AND m.mediable_id = ? AND ${scopeActive('m')}
       ORDER BY m.position ASC, m.id ASC`,
      [listingId],
    );
    return rows.map(toMediaDomain);
  }

  async findMediaById(mediaId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT m.*, mt.code AS media_type_code, mst.code AS moderation_status_code,
              trans.alt_text, trans.caption
       FROM media m
       JOIN media_types mt ON mt.id = m.media_type_id
       JOIN moderation_statuses mst ON mst.id = m.moderation_status_id
       LEFT JOIN media_translations trans
         ON trans.media_id = m.id
         AND trans.language_id = (SELECT id FROM languages WHERE is_default = 1 LIMIT 1)
       WHERE m.id = ? AND m.mediable_type = 'listing' AND ${scopeActive('m')}
       LIMIT 1`,
      [mediaId],
    );
    return rows[0] ? toMediaDomain(rows[0]) : null;
  }

  /** Upserts the default-locale alt-text/caption for one media item (Phase
   * 18) — mirrors `listing_translations`' "one authored UI-locale" scope
   * simplification rather than threading per-request locale through the
   * Media step. */
  async upsertMediaTranslation(
    mediaId,
    languageId,
    { altText, caption },
    connection = this.#pool,
  ) {
    await connection.query(
      `INSERT INTO media_translations (media_id, language_id, alt_text, caption)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         alt_text = VALUES(alt_text), caption = VALUES(caption)`,
      [mediaId, languageId, altText ?? null, caption ?? null],
    );
  }

  async attachMedia(
    {
      listingId,
      mediaTypeCode,
      url,
      mimeType,
      fileSizeBytes,
      ownerUserId,
      position,
      isCover,
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
         VALUES ('listing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          listingId,
          mediaType.id,
          url,
          position,
          isCover ? 1 : 0,
          completedStatus.id,
          pendingStatus.id,
          mimeType,
          fileSizeBytes,
          ownerUserId,
          ownerUserId,
          ownerUserId,
        ],
      );
      return this.findMediaById(result.insertId, connection);
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  async updateMedia(mediaId, fields, connection = this.#pool) {
    const assignments = [];
    const values = [];
    if (fields.position !== undefined) {
      assignments.push('position = ?');
      values.push(fields.position);
    }
    if (fields.isCover !== undefined) {
      assignments.push('is_cover = ?');
      values.push(fields.isCover ? 1 : 0);
    }
    if (fields.updatedBy !== undefined) {
      assignments.push('updated_by = ?');
      values.push(fields.updatedBy);
    }

    if (assignments.length > 0) {
      await connection.query(
        `UPDATE media SET ${assignments.join(', ')} WHERE id = ?`,
        [...values, mediaId],
      );
    }
    return this.findMediaById(mediaId, connection);
  }

  async removeMedia(mediaId, deletedByUserId, connection = this.#pool) {
    await connection.query(
      `UPDATE media SET ${softDeleteAssignment()}, deleted_by = ?, updated_by = ? WHERE id = ?`,
      [deletedByUserId, deletedByUserId, mediaId],
    );
  }

  // --- Phase 18 (Premium Listing Detail): highlights / itinerary /
  // included-items / FAQs. All four are structurally identical ordered
  // per-listing lists — each gets a `list*`/`replace*` pair using the same
  // "delete all, reinsert in the given order" full-replace semantics
  // `replaceAttributeValues` already established for MULTI_ENUM entries:
  // the partner wizard always resends the complete desired list on save,
  // so there is no separate per-item update/reorder endpoint to build.
  //
  // 2026 stabilization audit (migration 0037): each row now carries a
  // `language_id`, mirroring `listing_translations`' own shape rather than
  // inventing a new one — `list*` returns EVERY language's rows (tagged
  // with `languageCode`), exactly like `#assembleListing` already returns
  // every `listing_translations` row and leaves locale selection to the
  // caller (`getLocalizedTranslation.js` on the frontend). Filtering to
  // one locale, with its default-locale fallback, is intentionally a
  // single shared frontend concern (`getLocalizedItems.js`) rather than
  // four near-identical SQL fallback branches here.
  //
  // `replace*` still fully replaces exactly one language's list per call
  // (`DELETE ... WHERE listing_id = ? AND language_id = ?`, never
  // touching the other languages' rows) — the Partner Listing Wizard has
  // no per-field language selector yet (real, separate Partner Workspace
  // UI work, out of this audit's scope), so every write from it targets
  // `listingService`'s resolved default language, same as before this
  // migration effectively only ever had one language to write to.

  async listHighlights(listingId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT lh.id, lh.language_id, lang.code AS language_code, lh.icon_code, lh.text, lh.sort_order
       FROM listing_highlights lh
       JOIN languages lang ON lang.id = lh.language_id
       WHERE lh.listing_id = ? ORDER BY lh.language_id ASC, lh.sort_order ASC, lh.id ASC`,
      [listingId],
    );
    return rows.map((row) => ({
      id: row.id,
      languageId: row.language_id,
      languageCode: row.language_code,
      iconCode: row.icon_code,
      text: row.text,
      sortOrder: row.sort_order,
    }));
  }

  async replaceHighlights(
    listingId,
    highlights,
    userId,
    languageId,
    connection = this.#pool,
  ) {
    await connection.query(
      'DELETE FROM listing_highlights WHERE listing_id = ? AND language_id = ?',
      [listingId, languageId],
    );
    // eslint-disable-next-line no-restricted-syntax -- ordered insert, must preserve sequence
    for (const [index, highlight] of highlights.entries()) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await connection.query(
        `INSERT INTO listing_highlights (listing_id, language_id, icon_code, text, sort_order, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          listingId,
          languageId,
          highlight.iconCode,
          highlight.text,
          index,
          userId,
          userId,
        ],
      );
    }
    return this.listHighlights(listingId, connection);
  }

  async listItinerarySteps(listingId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT lis.id, lis.language_id, lang.code AS language_code, lis.sort_order, lis.title, lis.description, lis.duration_minutes
       FROM listing_itinerary_steps lis
       JOIN languages lang ON lang.id = lis.language_id
       WHERE lis.listing_id = ? ORDER BY lis.language_id ASC, lis.sort_order ASC, lis.id ASC`,
      [listingId],
    );
    return rows.map((row) => ({
      id: row.id,
      languageId: row.language_id,
      languageCode: row.language_code,
      sortOrder: row.sort_order,
      title: row.title,
      description: row.description,
      durationMinutes: row.duration_minutes,
    }));
  }

  async replaceItinerarySteps(
    listingId,
    steps,
    userId,
    languageId,
    connection = this.#pool,
  ) {
    await connection.query(
      'DELETE FROM listing_itinerary_steps WHERE listing_id = ? AND language_id = ?',
      [listingId, languageId],
    );
    // eslint-disable-next-line no-restricted-syntax -- ordered insert, must preserve sequence
    for (const [index, step] of steps.entries()) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await connection.query(
        `INSERT INTO listing_itinerary_steps
           (listing_id, language_id, sort_order, title, description, duration_minutes, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          listingId,
          languageId,
          index,
          step.title,
          step.description ?? null,
          step.durationMinutes ?? null,
          userId,
          userId,
        ],
      );
    }
    return this.listItinerarySteps(listingId, connection);
  }

  async listIncludedItems(listingId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT lii.id, lii.language_id, lang.code AS language_code, lii.item_text, lii.is_included, lii.sort_order
       FROM listing_included_items lii
       JOIN languages lang ON lang.id = lii.language_id
       WHERE lii.listing_id = ? ORDER BY lii.language_id ASC, lii.is_included DESC, lii.sort_order ASC, lii.id ASC`,
      [listingId],
    );
    return rows.map((row) => ({
      id: row.id,
      languageId: row.language_id,
      languageCode: row.language_code,
      itemText: row.item_text,
      isIncluded: Boolean(row.is_included),
      sortOrder: row.sort_order,
    }));
  }

  async replaceIncludedItems(
    listingId,
    items,
    userId,
    languageId,
    connection = this.#pool,
  ) {
    await connection.query(
      'DELETE FROM listing_included_items WHERE listing_id = ? AND language_id = ?',
      [listingId, languageId],
    );
    // eslint-disable-next-line no-restricted-syntax -- ordered insert, must preserve sequence
    for (const [index, item] of items.entries()) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await connection.query(
        `INSERT INTO listing_included_items
           (listing_id, language_id, item_text, is_included, sort_order, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          listingId,
          languageId,
          item.itemText,
          item.isIncluded ? 1 : 0,
          index,
          userId,
          userId,
        ],
      );
    }
    return this.listIncludedItems(listingId, connection);
  }

  async listFaqs(listingId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT lf.id, lf.language_id, lang.code AS language_code, lf.question, lf.answer, lf.sort_order
       FROM listing_faqs lf
       JOIN languages lang ON lang.id = lf.language_id
       WHERE lf.listing_id = ? ORDER BY lf.language_id ASC, lf.sort_order ASC, lf.id ASC`,
      [listingId],
    );
    return rows.map((row) => ({
      id: row.id,
      languageId: row.language_id,
      languageCode: row.language_code,
      question: row.question,
      answer: row.answer,
      sortOrder: row.sort_order,
    }));
  }

  async replaceFaqs(
    listingId,
    faqs,
    userId,
    languageId,
    connection = this.#pool,
  ) {
    await connection.query(
      'DELETE FROM listing_faqs WHERE listing_id = ? AND language_id = ?',
      [listingId, languageId],
    );
    // eslint-disable-next-line no-restricted-syntax -- ordered insert, must preserve sequence
    for (const [index, faq] of faqs.entries()) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      await connection.query(
        `INSERT INTO listing_faqs (listing_id, language_id, question, answer, sort_order, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          listingId,
          languageId,
          faq.question,
          faq.answer,
          index,
          userId,
          userId,
        ],
      );
    }
    return this.listFaqs(listingId, connection);
  }

  /**
   * Step A3 (Listing → Company Linking) — the minimal real public identity
   * of the listing's owning company, for the detail page's company
   * attribution block. Narrow, scoped lookup, same "own a small copy
   * rather than import across modules" precedent as
   * `getPartnerVerification` right below and `mysqlPartnerRepository.js`'s
   * own `CARD_METADATA_SELECT` doc comment. Gated on `moderation_status_id
   * = APPROVED` — the exact same public-visibility rule
   * `mysqlPartnerRepository.js#findPublicBySlug` already uses — so a
   * listing whose partner has since been flagged/deleted degrades to
   * `null` here (the listing itself still renders; it just loses its
   * attribution block) rather than ever linking to a non-public company
   * page. Returns only what the block needs: never `email`/`phone`/
   * `owner_user_id`/`legal_name`/moderation internals.
   */
  async getPublicCompanySummary(partnerId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT p.slug, p.display_name, lm.url AS logo_url, vms.code AS verification_status_code
       FROM partners p
       JOIN moderation_statuses ms ON ms.id = p.moderation_status_id
       JOIN moderation_statuses vms ON vms.id = p.verification_status_id
       LEFT JOIN media lm ON lm.id = p.logo_media_id AND lm.deleted_at IS NULL
       WHERE p.id = ? AND ${scopeActive('p')} AND ms.code = 'APPROVED'
       LIMIT 1`,
      [partnerId],
    );
    if (rows.length === 0) return null;
    return {
      slug: rows[0].slug,
      displayName: rows[0].display_name,
      logoUrl: rows[0].logo_url,
      isVerified: rows[0].verification_status_code === 'APPROVED',
    };
  }

  /**
   * Narrow, scoped lookup — see this file's header comment. Not a general
   * Partners repository; only what `ListingService.createListing` needs.
   */
  async getPartnerVerification(partnerId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT ms.code AS verification_status_code
       FROM partners p
       JOIN moderation_statuses ms ON ms.id = p.verification_status_id
       WHERE p.id = ? AND ${scopeActive('p')}
       LIMIT 1`,
      [partnerId],
    );
    if (rows.length === 0)
      return { exists: false, verificationStatusCode: null };
    return {
      exists: true,
      verificationStatusCode: rows[0].verification_status_code,
    };
  }

  async findListingTypeIdByCode(code, connection = this.#pool) {
    const [rows] = await connection.query(
      'SELECT id FROM listing_types WHERE code = ? LIMIT 1',
      [code],
    );
    return rows[0]?.id ?? null;
  }

  async findStatusIdByCode(code, connection = this.#pool) {
    const [rows] = await connection.query(
      'SELECT id FROM listing_statuses WHERE code = ? LIMIT 1',
      [code],
    );
    return rows[0]?.id ?? null;
  }

  async findModerationStatusIdByCode(code, connection = this.#pool) {
    const [rows] = await connection.query(
      'SELECT id FROM moderation_statuses WHERE code = ? LIMIT 1',
      [code],
    );
    return rows[0]?.id ?? null;
  }
}

export default MySqlListingRepository;
