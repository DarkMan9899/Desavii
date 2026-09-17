/**
 * MySQL-backed Partners repository.
 *
 * Phase 5's only Partners-module read was "which partner orgs does this
 * user belong to" (`listMembershipsForUser`). Phase 10 (redesign) adds
 * the module's first PUBLIC reads — a Companies directory and profile
 * page — built entirely on columns `partners` already had from Sprint 5
 * (`description`, `logo_media_id`, `cover_media_id`, `email`, `phone`,
 * `website`, `social_links`) that no UI had ever surfaced. Both new
 * queries scope to `moderation_status_id` = APPROVED, mirroring how
 * `listings`/`ls.code = 'PUBLISHED'` gates public listing visibility —
 * a partner pending/rejected moderation is not discoverable publicly,
 * same as a draft listing isn't. `listing_count` is a correlated
 * subquery counting only that partner's PUBLISHED listings, for the
 * same reason (a partner's draft listings aren't "their public
 * catalog"). Reviews/ratings are deliberately not selected — no Reviews
 * module/table exists anywhere in this schema.
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';
import { mapMysqlError } from '../../../infrastructure/database/errorMapping.js';
import {
  decodeCursor,
  buildPageMeta,
} from '../../../infrastructure/database/pagination.js';

/**
 * Company Public Profile (Step A1) — verbatim copy of
 * `mysqlSearchRepository.js`'s own `CARD_METADATA_SELECT` (not exported
 * there); see `listPublicListingsForPartner`'s own doc comment below for
 * why this file owns a copy rather than importing across modules. Every
 * field is `NULL` whenever that attribute was never authored for the
 * listing — never a guessed/fabricated default.
 */
const CARD_METADATA_SELECT = `
      (SELECT lc.slug FROM listing_category_listing lcl_card
         JOIN listing_categories lc ON lc.id = lcl_card.category_id
         WHERE lcl_card.listing_id = l.id
         ORDER BY lcl_card.category_id ASC LIMIT 1
      ) AS category_slug,
      (SELECT GROUP_CONCAT(ao_cuisine.code ORDER BY ao_cuisine.sort_order SEPARATOR ',')
         FROM listing_attribute_option lao_cuisine
         JOIN attribute_options ao_cuisine ON ao_cuisine.id = lao_cuisine.attribute_option_id
         JOIN attribute_definitions ad_cuisine ON ad_cuisine.id = ao_cuisine.attribute_definition_id
         WHERE lao_cuisine.listing_id = l.id AND ad_cuisine.code = 'cuisine'
      ) AS cuisine_codes,
      (SELECT ao_tier.code
         FROM listing_attribute_option lao_tier
         JOIN attribute_options ao_tier ON ao_tier.id = lao_tier.attribute_option_id
         JOIN attribute_definitions ad_tier ON ad_tier.id = ao_tier.attribute_definition_id
         WHERE lao_tier.listing_id = l.id AND ad_tier.code = 'price_tier'
         LIMIT 1
      ) AS price_tier_code,
      (SELECT ao_star.code
         FROM listing_attribute_option lao_star
         JOIN attribute_options ao_star ON ao_star.id = lao_star.attribute_option_id
         JOIN attribute_definitions ad_star ON ad_star.id = ao_star.attribute_definition_id
         WHERE lao_star.listing_id = l.id AND ad_star.code = 'star_rating'
         LIMIT 1
      ) AS star_rating_code,
      (SELECT ao_trans.code
         FROM listing_attribute_option lao_trans
         JOIN attribute_options ao_trans ON ao_trans.id = lao_trans.attribute_option_id
         JOIN attribute_definitions ad_trans ON ad_trans.id = ao_trans.attribute_definition_id
         WHERE lao_trans.listing_id = l.id AND ad_trans.code = 'transmission'
         LIMIT 1
      ) AS transmission_code,
      (SELECT lav_bed.value
         FROM listing_attribute_values_integer lav_bed
         JOIN attribute_definitions ad_bed ON ad_bed.id = lav_bed.attribute_definition_id
         WHERE lav_bed.listing_id = l.id AND ad_bed.code = 'bedrooms'
         LIMIT 1
      ) AS bedrooms_value,
      (SELECT lav_dur.value
         FROM listing_attribute_values_integer lav_dur
         JOIN attribute_definitions ad_dur ON ad_dur.id = lav_dur.attribute_definition_id
         WHERE lav_dur.listing_id = l.id AND ad_dur.code = 'duration_minutes'
         LIMIT 1
      ) AS duration_minutes_value`;

/**
 * Company Public Profile (Step A1) — one row of a partner's public
 * catalog, same mapping rules as `mysqlSearchRepository.js`'s own
 * `toSearchResultDomain`: real value or `null`, never guessed.
 * `cuisine_codes` is GROUP_CONCAT'd into a comma string by the subquery
 * above, split back into option codes here.
 */
function toPartnerListingDomain(row) {
  return {
    id: row.id,
    slug: row.slug,
    listingTypeCode: row.listing_type_code,
    createdAt: row.created_at,
    title: row.title,
    cityName: row.city_name,
    coverImageUrl: row.cover_image_url,
    priceAmount: row.price_amount,
    priceCurrencyCode: row.price_currency_code,
    ratingAverage:
      row.rating_average !== null ? Number(row.rating_average) : null,
    reviewCount: Number(row.review_count),
    categorySlug: row.category_slug ?? null,
    cuisineCodes: row.cuisine_codes ? row.cuisine_codes.split(',') : null,
    priceTierCode: row.price_tier_code ?? null,
    starRatingCode: row.star_rating_code ?? null,
    transmissionCode: row.transmission_code ?? null,
    bedroomsValue:
      row.bedrooms_value !== undefined && row.bedrooms_value !== null
        ? Number(row.bedrooms_value)
        : null,
    durationMinutesValue:
      row.duration_minutes_value !== undefined &&
      row.duration_minutes_value !== null
        ? Number(row.duration_minutes_value)
        : null,
  };
}

function toMembershipDomain(row) {
  return {
    partnerId: row.id,
    slug: row.slug,
    displayName: row.display_name,
    roleCode: row.role_code,
    // P1.2 (Master Roadmap): additive — lets a caller that does want the
    // full picture (listMembershipsForUserAdmin; a future "my
    // applications" list) distinguish a real, approved membership from
    // an in-progress application without a second query.
    verificationStatusCode: row.verification_status_code,
  };
}

function toPartnerSummaryDomain(row) {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    description: row.description,
    logoUrl: row.logo_url,
    coverUrl: row.cover_url,
    listingCount: Number(row.listing_count),
    isVerified: row.verification_status_code === 'APPROVED',
    memberSince: row.member_since,
    ratingAverage: row.rating_average ? Number(row.rating_average) : null,
    reviewCount: row.review_count ? Number(row.review_count) : 0,
  };
}

function toPartnerDetailDomain(row) {
  return {
    ...toPartnerSummaryDomain(row),
    email: row.email,
    phone: row.phone,
    website: row.website,
    // mysql2 already deserializes a JSON-column value into a real JS
    // object before it ever reaches this row — `JSON.parse` on top of
    // that throws ("[object Object]" is not valid JSON) the first time
    // this column is ever non-null (P1.3 is the first write path this
    // column ever had; every prior read saw only NULL, so this bug was
    // latent, never actually exercised, until now).
    socialLinks: row.social_links ?? {},
  };
}

/**
 * Phase 11 Admin Platform: unlike the public summary/detail rows above
 * (scoped to APPROVED/non-deleted only), admin rows surface every
 * partner in any status plus both status codes side by side —
 * `verification_status_code` (PENDING/APPROVED/REJECTED, an admin's
 * onboarding decision) and `moderation_status_code` (APPROVED/FLAGGED,
 * an admin's "suspend"/"restore" decision on an already-verified
 * partner — see `partnerService.js`'s `updateModerationStatus` doc
 * comment for why `FLAGGED` is this schema's only "suspended" value).
 */
function toPartnerAdminSummaryDomain(row) {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    email: row.email,
    logoUrl: row.logo_url,
    verificationStatusCode: row.verification_status_code,
    moderationStatusCode: row.moderation_status_code,
    listingCount: Number(row.listing_count),
    createdAt: row.created_at,
  };
}

function toPartnerAdminDetailDomain(row) {
  return {
    ...toPartnerAdminSummaryDomain(row),
    legalName: row.legal_name,
    phone: row.phone,
    website: row.website,
    coverUrl: row.cover_url,
    // See `toPartnerDetailDomain`'s identical comment — mysql2 already
    // deserializes this JSON column; parsing it again throws.
    socialLinks: row.social_links ?? {},
    // P1.2 (Master Roadmap): the admin's feedback on a NEEDS_CHANGES (or
    // REJECTED) review decision — see updateVerificationStatus's own doc
    // comment for the full lifecycle.
    reviewNote: row.review_note,
    totalListingCount: Number(row.total_listing_count),
    publishedListingCount: Number(row.published_listing_count),
    ownerEmail: row.owner_email,
    ownerFirstName: row.owner_first_name,
    ownerLastName: row.owner_last_name,
    // P1.3 (Master Roadmap): attached by `findByIdAdmin` in a second
    // query, never selected here — see `findTranslations`'s own comment.
    translations: [],
  };
}

function toTranslationDomain(row) {
  return {
    id: row.id,
    partnerId: row.partner_id,
    languageId: row.language_id,
    languageCode: row.language_code,
    description: row.description,
  };
}

// P1.3 (Master Roadmap): `p.description` was dropped in migration 0031
// in favor of `partner_translations` (localized) — this "any available
// description" subquery is the list/card-view fallback, mirroring
// `mysqlListingRepository.js`'s identical `(SELECT title FROM
// listing_translations ... ORDER BY language_id ASC LIMIT 1)` pattern
// for list rows: real per-locale resolution only matters once a reader
// is looking at ONE company's own page, not scanning a directory of
// many — see `findPublicBySlug`'s own comment for that real resolution.
const PUBLIC_SELECT_COLUMNS = `
  p.id, p.slug, p.display_name, p.email, p.phone, p.website, p.social_links,
  (SELECT description FROM partner_translations WHERE partner_id = p.id ORDER BY language_id ASC LIMIT 1) AS description,
  p.created_at AS member_since,
  lm.url AS logo_url, cm.url AS cover_url, vms.code AS verification_status_code,
  (SELECT COUNT(*) FROM listings l
     JOIN listing_statuses ls ON ls.id = l.status_id
     WHERE l.partner_id = p.id AND l.deleted_at IS NULL AND ls.code = 'PUBLISHED'
  ) AS listing_count,
  -- Phase 18 (Premium Listing Detail — Host/Partner trust section):
  -- aggregate rating across the partner's own listings' approved
  -- reviews. Mirrors the exact same read-only aggregate pattern
  -- mysqlListingRepository.findById already uses for a single listing's
  -- rating_average/review_count — never a second write path over
  -- \`reviews\`.
  (SELECT AVG(rv.rating) FROM reviews rv
     JOIN moderation_statuses rms ON rms.id = rv.status_id
     JOIN listings rl ON rl.id = rv.listing_id
     WHERE rl.partner_id = p.id AND rms.code = 'APPROVED' AND rv.deleted_at IS NULL
  ) AS rating_average,
  (SELECT COUNT(*) FROM reviews rv
     JOIN moderation_statuses rms ON rms.id = rv.status_id
     JOIN listings rl ON rl.id = rv.listing_id
     WHERE rl.partner_id = p.id AND rms.code = 'APPROVED' AND rv.deleted_at IS NULL
  ) AS review_count
`;
const PUBLIC_FROM_JOINED = `
  FROM partners p
  JOIN moderation_statuses ms ON ms.id = p.moderation_status_id
  JOIN moderation_statuses vms ON vms.id = p.verification_status_id
  LEFT JOIN media lm ON lm.id = p.logo_media_id AND lm.deleted_at IS NULL
  LEFT JOIN media cm ON cm.id = p.cover_media_id AND cm.deleted_at IS NULL
`;

// Admin variants reuse the exact same FROM/JOIN chain as the public
// queries — only the WHERE clause (no APPROVED-only scoping) and the
// selected columns (both status codes, not just verification) differ.
const ADMIN_SELECT_COLUMNS = `
  p.id, p.slug, p.display_name, p.email,
  lm.url AS logo_url, vms.code AS verification_status_code, ms.code AS moderation_status_code,
  p.created_at,
  (SELECT COUNT(*) FROM listings l WHERE l.partner_id = p.id AND l.deleted_at IS NULL) AS listing_count
`;
const ADMIN_DETAIL_SELECT_COLUMNS = `
  p.id, p.slug, p.legal_name, p.display_name, p.email, p.phone, p.website, p.social_links,
  p.review_note,
  lm.url AS logo_url, cm.url AS cover_url, vms.code AS verification_status_code, ms.code AS moderation_status_code,
  p.created_at,
  (SELECT COUNT(*) FROM listings l WHERE l.partner_id = p.id AND l.deleted_at IS NULL) AS total_listing_count,
  (SELECT COUNT(*) FROM listings l JOIN listing_statuses ls ON ls.id = l.status_id
     WHERE l.partner_id = p.id AND l.deleted_at IS NULL AND ls.code = 'PUBLISHED'
  ) AS published_listing_count,
  owner.email AS owner_email, owner.first_name AS owner_first_name, owner.last_name AS owner_last_name
`;
const ADMIN_FROM_JOINED = `${PUBLIC_FROM_JOINED}
  LEFT JOIN users owner ON owner.id = p.owner_user_id
`;

export class MySqlPartnerRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  /**
   * @param {number} userId
   * @param {{approvedOnly?: boolean}} [opts] P1.2 (Master Roadmap):
   *   `approvedOnly` excludes a DRAFT/PENDING/NEEDS_CHANGES/REJECTED
   *   application — real, capability-granting memberships only. Default
   *   `false` preserves this method's two other callers' existing
   *   behavior (`listMembershipsForUserAdmin`, and `applyToBecomePartner`'s
   *   own "do you already have one in progress" check, which needs to
   *   see exactly the statuses `approvedOnly` would hide). `GET
   *   /partners/mine` is the one caller that opts into `approvedOnly` —
   *   its response feeds `AuthContext`'s `partnerships` array, which
   *   `RequirePartner` uses to gate the entire partner dashboard; an
   *   applicant mid-review must not get real partner capabilities just
   *   because a `partner_employees` OWNER row already exists for their
   *   still-unapproved application.
   * @returns {Promise<Array<{partnerId, slug, displayName, roleCode}>>}
   */
  async listMembershipsForUser(userId, { approvedOnly = false } = {}) {
    const conditions = [
      'pe.user_id = ?',
      'pe.deleted_at IS NULL',
      'p.deleted_at IS NULL',
    ];
    if (approvedOnly) {
      conditions.push("vms.code = 'APPROVED'");
    }
    const [rows] = await this.#pool.query(
      `SELECT p.id, p.slug, p.display_name, per.code AS role_code, vms.code AS verification_status_code
       FROM partner_employees pe
       JOIN partners p ON p.id = pe.partner_id
       JOIN partner_employee_roles per ON per.id = pe.role_id
       JOIN moderation_statuses vms ON vms.id = p.verification_status_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.display_name ASC`,
      [userId],
    );
    return rows.map(toMembershipDomain);
  }

  /**
   * Public Companies directory — every APPROVED, non-deleted partner,
   * newest first. Phase 10.
   * @param {{cursor?: string|null, limit?: number}} [paginationOpts]
   */
  async listPublic({ cursor = null, limit = 20 } = {}) {
    const conditions = ['p.deleted_at IS NULL', "ms.code = 'APPROVED'"];
    const params = [];

    const decoded = decodeCursor(cursor);
    if (decoded?.id) {
      conditions.push('p.id < ?');
      params.push(decoded.id);
    }

    const [rows] = await this.#pool.query(
      `SELECT ${PUBLIC_SELECT_COLUMNS} ${PUBLIC_FROM_JOINED}
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.id DESC
       LIMIT ?`,
      [...params, limit + 1],
    );

    const { rows: pageRows, meta } = buildPageMeta(rows, limit, (row) => ({
      id: row.id,
    }));
    return { rows: pageRows.map(toPartnerSummaryDomain), meta };
  }

  /**
   * Public Company profile — an APPROVED, non-deleted partner by slug.
   * Phase 10. Returns `null` for an unknown/unapproved/deleted slug —
   * the Service maps that to a 404, same as `findBySlug` misses do
   * everywhere else in this codebase (listings, categories).
   *
   * P1.3 (Master Roadmap): unlike the "any available description"
   * fallback on `PUBLIC_SELECT_COLUMNS` (fine for a directory card), a
   * reader on the company's own page deserves the real, locale-aware
   * text — so this attaches the FULL `translations` array (same
   * two-query shape `mysqlListingRepository.js`'s `#assembleListing`
   * uses for a single listing), leaving locale resolution to the
   * frontend's `getLocalizedTranslation` util rather than threading a
   * `?locale=` param through this read.
   * @param {string} slug
   */
  async findPublicBySlug(slug) {
    const [rows] = await this.#pool.query(
      `SELECT ${PUBLIC_SELECT_COLUMNS} ${PUBLIC_FROM_JOINED}
       WHERE p.slug = ? AND p.deleted_at IS NULL AND ms.code = 'APPROVED'
       LIMIT 1`,
      [slug],
    );
    if (!rows[0]) return null;
    const translations = await this.findTranslations(rows[0].id);
    return { ...toPartnerDetailDomain(rows[0]), translations };
  }

  /**
   * Phase 11 Admin Platform admin list — every non-deleted partner
   * regardless of status, newest first. Keyword matches display name,
   * email, or slug.
   * @param {{keyword?: string, verificationStatus?: string, moderationStatus?: string, cursor?: string|null, limit?: number}} [opts]
   */
  async listAdmin({
    keyword,
    verificationStatus,
    moderationStatus,
    cursor = null,
    limit = 20,
  } = {}) {
    const conditions = ['p.deleted_at IS NULL'];
    const params = [];

    if (keyword) {
      conditions.push(
        '(p.display_name LIKE ? OR p.email LIKE ? OR p.slug LIKE ?)',
      );
      const pattern = `%${keyword}%`;
      params.push(pattern, pattern, pattern);
    }
    if (verificationStatus) {
      conditions.push('vms.code = ?');
      params.push(verificationStatus);
    }
    if (moderationStatus) {
      conditions.push('ms.code = ?');
      params.push(moderationStatus);
    }

    const decoded = decodeCursor(cursor);
    if (decoded?.id) {
      conditions.push('p.id < ?');
      params.push(decoded.id);
    }

    const [rows] = await this.#pool.query(
      `SELECT ${ADMIN_SELECT_COLUMNS} ${PUBLIC_FROM_JOINED}
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.id DESC
       LIMIT ?`,
      [...params, limit + 1],
    );

    const { rows: pageRows, meta } = buildPageMeta(rows, limit, (row) => ({
      id: row.id,
    }));
    return { rows: pageRows.map(toPartnerAdminSummaryDomain), meta };
  }

  /**
   * Phase 11 Admin Platform admin detail — any non-deleted partner
   * regardless of status, plus listing stats and the owning user's
   * identity (`partners.owner_user_id`, set at creation, distinct from
   * the possibly-multiple `partner_employees` OWNER-role rows). Also the
   * P1.2 owner-facing "my application" read (same shape, gated
   * differently at the Service layer) — accepts an optional `connection`
   * so a caller inside an open transaction (`createApplication`) reads
   * back the row it just inserted on the SAME connection, not a pool
   * connection that can't see it pre-commit.
   * @param {number} id
   * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} [connection]
   */
  async findByIdAdmin(id, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT ${ADMIN_DETAIL_SELECT_COLUMNS} ${ADMIN_FROM_JOINED}
       WHERE p.id = ? AND p.deleted_at IS NULL
       LIMIT 1`,
      [id],
    );
    if (!rows[0]) return null;
    const translations = await this.findTranslations(id, connection);
    return { ...toPartnerAdminDetailDomain(rows[0]), translations };
  }

  /**
   * P1.3 (Master Roadmap) — every localized description this partner
   * has, one row per language it's been authored in (never all
   * languages padded with empty rows) — mirrors
   * `mysqlListingRepository.js`'s translation-array read exactly.
   * @param {number} partnerId
   * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} [connection]
   */
  async findTranslations(partnerId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT pt.id, pt.partner_id, pt.language_id, pt.description, lang.code AS language_code
       FROM partner_translations pt
       JOIN languages lang ON lang.id = pt.language_id
       WHERE pt.partner_id = ?
       ORDER BY pt.language_id ASC`,
      [partnerId],
    );
    return rows.map(toTranslationDomain);
  }

  /**
   * Upserts one language's description — `ON DUPLICATE KEY UPDATE`
   * against `uq_partner_translations_partner_id_language_id`, mirroring
   * `mysqlListingRepository.js#insertTranslation` exactly.
   * @param {{partnerId: number, languageId: number, description: string|null}} data
   * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} [connection]
   */
  async upsertTranslation(
    { partnerId, languageId, description },
    connection = this.#pool,
  ) {
    try {
      await connection.query(
        `INSERT INTO partner_translations (partner_id, language_id, description)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE description = VALUES(description)`,
        [partnerId, languageId, description],
      );
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  /**
   * P1.2 (Master Roadmap) — self-service partner onboarding.
   * `verification_status_id` starts at DRAFT; `moderation_status_id`
   * starts at PENDING (an unverified partner has no meaningful
   * moderation state yet — it must never start at APPROVED, which would
   * make an unreviewed company page publicly visible). Creates the
   * owning `partner_employees` OWNER row in the SAME transaction so
   * `GET /partners/mine` (already existing, unchanged) picks up the new
   * application immediately with zero special-casing.
   */
  async createApplication(
    {
      legalName,
      displayName,
      slug,
      description,
      languageId,
      email,
      phone,
      website,
      ownerUserId,
    },
    connection,
  ) {
    try {
      const [result] = await connection.query(
        `INSERT INTO partners
          (legal_name, display_name, slug, email, phone, website,
           verification_status_id, moderation_status_id, owner_user_id, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?,
           (SELECT id FROM moderation_statuses WHERE code = 'DRAFT'),
           (SELECT id FROM moderation_statuses WHERE code = 'PENDING'),
           ?, ?, ?)`,
        [
          legalName,
          displayName,
          slug,
          email ?? null,
          phone ?? null,
          website ?? null,
          ownerUserId,
          ownerUserId,
          ownerUserId,
        ],
      );
      const partnerId = result.insertId;
      await connection.query(
        `INSERT INTO partner_employees (partner_id, user_id, role_id, created_by, updated_by)
         VALUES (?, ?, (SELECT id FROM partner_employee_roles WHERE code = 'OWNER'), ?, ?)`,
        [partnerId, ownerUserId, ownerUserId, ownerUserId],
      );
      if (description) {
        await this.upsertTranslation(
          { partnerId, languageId, description },
          connection,
        );
      }
      return this.findByIdAdmin(partnerId, connection);
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  /** @param {string} slug @returns {Promise<boolean>} */
  async slugExists(slug, connection = this.#pool) {
    const [rows] = await connection.query(
      'SELECT id FROM partners WHERE active_slug = ? LIMIT 1',
      [slug],
    );
    return rows.length > 0;
  }

  /**
   * P1.2 — owner-side edit of an in-progress application. The Service
   * enforces that this only runs while `verification_status_id` is
   * DRAFT/NEEDS_CHANGES; the repository just writes whatever fields are
   * supplied (undefined = leave unchanged, matching every other
   * repository's partial-update convention in this codebase).
   */
  async updateApplication(
    id,
    { legalName, displayName, description, languageId, email, phone, website },
    connection = this.#pool,
  ) {
    const assignments = [];
    const values = [];
    if (legalName !== undefined) {
      assignments.push('legal_name = ?');
      values.push(legalName);
    }
    if (displayName !== undefined) {
      assignments.push('display_name = ?');
      values.push(displayName);
    }
    if (email !== undefined) {
      assignments.push('email = ?');
      values.push(email);
    }
    if (phone !== undefined) {
      assignments.push('phone = ?');
      values.push(phone);
    }
    if (website !== undefined) {
      assignments.push('website = ?');
      values.push(website);
    }
    if (description !== undefined) {
      await this.upsertTranslation(
        { partnerId: id, languageId, description },
        connection,
      );
    }
    if (assignments.length === 0) return this.findByIdAdmin(id, connection);
    values.push(id);
    await connection.query(
      `UPDATE partners SET ${assignments.join(', ')} WHERE id = ?`,
      values,
    );
    return this.findByIdAdmin(id, connection);
  }

  /**
   * @param {number} id
   * @param {string} statusCode DRAFT|PENDING|NEEDS_CHANGES|APPROVED|REJECTED
   * @param {{reviewNote?: string|null, alsoApproveModerationStatus?: boolean}} [opts]
   *   `alsoApproveModerationStatus`: P1.2 — a fresh application's
   *   `moderation_status_id` starts at PENDING (never APPROVED — see
   *   `createApplication`'s comment), so the one moment it must become
   *   publicly visible is exactly when an admin approves verification.
   *   Doing both in the SAME UPDATE keeps them atomic — there is no
   *   window where a partner is verification-APPROVED but still
   *   moderation-PENDING (and therefore invisible for no visible reason).
   */
  async updateVerificationStatus(
    id,
    statusCode,
    { reviewNote, alsoApproveModerationStatus = false } = {},
  ) {
    const assignments = [
      'verification_status_id = (SELECT id FROM moderation_statuses WHERE code = ?)',
    ];
    const values = [statusCode];
    if (reviewNote !== undefined) {
      assignments.push('review_note = ?');
      values.push(reviewNote);
    }
    if (alsoApproveModerationStatus) {
      assignments.push(
        "moderation_status_id = (SELECT id FROM moderation_statuses WHERE code = 'APPROVED')",
      );
    }
    values.push(id);
    await this.#pool.query(
      `UPDATE partners SET ${assignments.join(', ')} WHERE id = ?`,
      values,
    );
    return this.findByIdAdmin(id);
  }

  /**
   * @param {number} id
   * @param {string} statusCode APPROVED|FLAGGED — "restore"/"suspend"
   * (see `partnerService.js`'s doc comment for why this schema has no
   * literal SUSPENDED value).
   */
  async updateModerationStatus(id, statusCode) {
    await this.#pool.query(
      `UPDATE partners
       SET moderation_status_id = (SELECT id FROM moderation_statuses WHERE code = ?)
       WHERE id = ?`,
      [statusCode, id],
    );
    return this.findByIdAdmin(id);
  }

  /**
   * P1.3 (Master Roadmap) — owner/staff edit of an APPROVED partner's
   * public company identity. Unlike `updateApplication` (which the
   * Service restricts to DRAFT/NEEDS_CHANGES applications), this has no
   * status restriction of its own — `partnerService.js#assertCanManage
   * Profile` is what gates who may call it, not this method. Adds
   * `socialLinks` (JSON-stringified) support, which `updateApplication`
   * never needed (the onboarding form has no social-links field).
   */
  async updateProfile(
    id,
    { displayName, email, phone, website, socialLinks },
    connection = this.#pool,
  ) {
    const assignments = [];
    const values = [];
    if (displayName !== undefined) {
      assignments.push('display_name = ?');
      values.push(displayName);
    }
    if (email !== undefined) {
      assignments.push('email = ?');
      values.push(email);
    }
    if (phone !== undefined) {
      assignments.push('phone = ?');
      values.push(phone);
    }
    if (website !== undefined) {
      assignments.push('website = ?');
      values.push(website);
    }
    if (socialLinks !== undefined) {
      assignments.push('social_links = ?');
      values.push(JSON.stringify(socialLinks));
    }
    if (assignments.length === 0) return this.findByIdAdmin(id, connection);
    values.push(id);
    await connection.query(
      `UPDATE partners SET ${assignments.join(', ')} WHERE id = ?`,
      values,
    );
    return this.findByIdAdmin(id, connection);
  }

  /**
   * P1.3 — points `logo_media_id`/`cover_media_id` at a freshly uploaded
   * `media` row. Only the one kind being replaced is touched (partial
   * update, same `undefined` = leave unchanged convention as every other
   * write in this repository).
   * @param {{logoMediaId?: number, coverMediaId?: number}} fields
   */
  async updateMedia(
    id,
    { logoMediaId, coverMediaId },
    connection = this.#pool,
  ) {
    const assignments = [];
    const values = [];
    if (logoMediaId !== undefined) {
      assignments.push('logo_media_id = ?');
      values.push(logoMediaId);
    }
    if (coverMediaId !== undefined) {
      assignments.push('cover_media_id = ?');
      values.push(coverMediaId);
    }
    if (assignments.length === 0) return this.findByIdAdmin(id, connection);
    values.push(id);
    await connection.query(
      `UPDATE partners SET ${assignments.join(', ')} WHERE id = ?`,
      values,
    );
    return this.findByIdAdmin(id, connection);
  }

  /**
   * P1.3 — inserts the `media` row a logo/cover upload points to.
   * `mediable_type = 'partner'` for provenance even though no query
   * currently joins back by it (`partners.logo_media_id`/`cover_media_id`
   * are direct soft references, same as `mysqlListingRepository.js#
   * attachMedia`'s `mediable_type = 'listing'` precedent).
   * `moderation_status_id` starts APPROVED, not PENDING — a partner's own
   * logo/cover is their direct upload of their own identity, not
   * user-generated content awaiting review (unlike a listing photo).
   */
  async insertMedia(
    { partnerId, mimeType, url, fileSizeBytes, ownerUserId },
    connection = this.#pool,
  ) {
    try {
      const [result] = await connection.query(
        `INSERT INTO media
          (mediable_type, mediable_id, media_type_id, url, upload_status_id, moderation_status_id, mime_type, file_size_bytes, owner_user_id, created_by, updated_by)
         VALUES ('partner', ?,
           (SELECT id FROM media_types WHERE code = 'IMAGE'),
           ?,
           (SELECT id FROM media_upload_statuses WHERE code = 'COMPLETED'),
           (SELECT id FROM moderation_statuses WHERE code = 'APPROVED'),
           ?, ?, ?, ?, ?)`,
        [
          partnerId,
          url,
          mimeType,
          fileSizeBytes,
          ownerUserId,
          ownerUserId,
          ownerUserId,
        ],
      );
      const [[media]] = await connection.query(
        'SELECT id, url FROM media WHERE id = ?',
        [result.insertId],
      );
      return media;
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  /**
   * Phase 13 (Notifications): the reverse of `listMembershipsForUser` —
   * given a partner id, who should receive a partner-level notification
   * (approval status change, a new review/favorite on one of their
   * listings). Returns the earliest-added OWNER; a partner org can have
   * multiple OWNER rows, but exactly one recipient keeps notification
   * fan-out simple (no distribution list feature exists — that would be
   * a future Messaging-module concern).
   */
  async findOwnerUserId(partnerId) {
    const [rows] = await this.#pool.query(
      `SELECT pe.user_id
       FROM partner_employees pe
       JOIN partner_employee_roles per ON per.id = pe.role_id
       WHERE pe.partner_id = ? AND pe.deleted_at IS NULL AND per.code = 'OWNER'
       ORDER BY pe.created_at ASC
       LIMIT 1`,
      [partnerId],
    );
    return rows[0]?.user_id ?? null;
  }

  /**
   * Company Public Profile (Step A1) — every currently-PUBLISHED,
   * non-deleted listing owned by this partner, across all 9 categories,
   * paginated newest-first. Deliberately does NOT re-check the partner's
   * own moderation status here (the Service layer already resolved the
   * partner via `findPublicBySlug`, which is the single source of truth
   * for "is this company publicly visible" — duplicating that gate on
   * every listing row would be redundant, not safer).
   *
   * `CARD_METADATA_SELECT` below is a verbatim copy of
   * `mysqlSearchRepository.js`'s own constant of the same name (not
   * exported there), following the exact same "duplicate this
   * self-contained SQL fragment rather than couple across modules"
   * convention `mysqlFavoriteRepository.js` already established for the
   * identical reason — `modules/partners` has no existing dependency on
   * `modules/search`, and importing one function from it would be a
   * heavier, one-off coupling for a handful of correlated subqueries
   * this file can just as safely own a copy of. Every field is `NULL`
   * whenever that attribute was never authored for the listing — never a
   * guessed/fabricated default, same rule search's own copy documents.
   *
   * Price intentionally uses the simpler listing-level
   * `listing_pricing` fallback (like `mysqlFavoriteRepository.js`'s own
   * listing price column), not `mysqlSearchRepository.js`'s fuller
   * "MIN across bookable units" resolution — this is a company's own
   * catalog list, not the primary Search results page, matching the
   * exact precedent Favorites already established for the same
   * "real price, simpler source" tradeoff.
   *
   * Lifecycle note (Step A1 scope): no `expires_at`/frozen-listing
   * filtering exists yet — a future Listing Lifetime/Renewal feature can
   * extend the `conditions` array here the same way `status`/`cursor`
   * already do, without changing this method's shape.
   * @param {number} partnerId
   * @param {{cursor?: string|null, limit?: number}} [paginationOpts]
   */
  async listPublicListingsForPartner(
    partnerId,
    { cursor = null, limit = 20 } = {},
  ) {
    const conditions = [
      'l.partner_id = ?',
      'l.deleted_at IS NULL',
      "ls.code = 'PUBLISHED'",
    ];
    const params = [partnerId];

    const decoded = decodeCursor(cursor);
    if (
      decoded &&
      decoded.createdAt !== undefined &&
      decoded.id !== undefined
    ) {
      conditions.push('(l.created_at, l.id) < (?, ?)');
      params.push(decoded.createdAt, decoded.id);
    }

    const [rows] = await this.#pool.query(
      `SELECT
         l.id, l.slug, ltype.code AS listing_type_code, l.created_at,
         COALESCE(
           lt.title,
           (SELECT lt_any.title FROM listing_translations lt_any
              WHERE lt_any.listing_id = l.id ORDER BY lt_any.language_id ASC LIMIT 1),
           ''
         ) AS title,
         c.name AS city_name,
         m.url AS cover_image_url,
         lp.amount AS price_amount, cur.code AS price_currency_code,
         (SELECT AVG(rv.rating) FROM reviews rv
            JOIN moderation_statuses rms ON rms.id = rv.status_id
            WHERE rv.listing_id = l.id AND rms.code = 'APPROVED' AND rv.deleted_at IS NULL
         ) AS rating_average,
         (SELECT COUNT(*) FROM reviews rv
            JOIN moderation_statuses rms ON rms.id = rv.status_id
            WHERE rv.listing_id = l.id AND rms.code = 'APPROVED' AND rv.deleted_at IS NULL
         ) AS review_count,
         ${CARD_METADATA_SELECT}
       FROM listings l
       JOIN listing_types ltype ON ltype.id = l.listing_type_id
       JOIN listing_statuses ls ON ls.id = l.status_id
       LEFT JOIN listing_locations loc ON loc.listing_id = l.id
       LEFT JOIN cities c ON c.id = loc.city_id
       LEFT JOIN listing_translations lt ON lt.listing_id = l.id AND lt.language_id = (SELECT id FROM languages WHERE is_default = 1 LIMIT 1)
       -- Step A2 fix: the fallback title used to LEFT JOIN listing_translations
       -- unscoped by language_id, fanning out one row per translation
       -- (a listing with 3 authored locales rendered as 3 duplicate cards).
       -- The COALESCE'd correlated subquery above picks one deterministic
       -- fallback row instead, matching this file's own "any available
       -- description" subquery convention (see PUBLIC_SELECT_COLUMNS).
       LEFT JOIN media m ON m.mediable_type = 'listing' AND m.mediable_id = l.id AND m.is_cover = 1 AND m.deleted_at IS NULL
       LEFT JOIN listing_pricing lp ON lp.listing_id = l.id
       LEFT JOIN currencies cur ON cur.id = lp.currency_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT ?`,
      [...params, limit + 1],
    );

    const { rows: pageRows, meta } = buildPageMeta(rows, limit, (row) => ({
      createdAt: row.created_at,
      id: row.id,
    }));
    return { rows: pageRows.map(toPartnerListingDomain), meta };
  }
}

export default MySqlPartnerRepository;
