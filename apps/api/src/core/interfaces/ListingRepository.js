/**
 * ListingRepository port.
 *
 * Domain-layer interface (BACKEND_ARCHITECTURE.md §7), implemented
 * concretely by `src/modules/listings/repositories/mysqlListingRepository.js`.
 * The Listings module owns `listings`, `listing_translations`,
 * `listing_locations`, `listing_category_listing`,
 * `listing_amenity_listing`, `listing_slug_history`, and the
 * `mediable_type = 'listing'` slice of the polymorphic `media` table
 * (Module Catalog #7) — every other module depends on `ListingService`'s
 * public interface, never this repository directly.
 *
 * @typedef {object} ListingRecord
 * @property {number} id
 * @property {number} partnerId
 * @property {number} listingTypeId
 * @property {string} slug
 * @property {number} statusId
 * @property {string} statusCode
 * @property {number} moderationStatusId
 * @property {boolean} isFeatured
 * @property {string|null} publishedAt
 * @property {string|null} unpublishedAt
 * @property {string|null} canonicalUrl
 * @property {number|null} ogImageMediaId
 * @property {boolean} isIndexable
 * @property {boolean} isSitemapIncluded
 */

/* eslint-disable class-methods-use-this, no-unused-vars */
export class ListingRepository {
  /** @returns {Promise<ListingRecord>} */
  async create(data) {
    throw new Error(
      'ListingRepository.create must be implemented by a concrete adapter.',
    );
  }

  /** @param {number} id @returns {Promise<ListingRecord|null>} */
  async findById(id) {
    throw new Error(
      'ListingRepository.findById must be implemented by a concrete adapter.',
    );
  }

  /** @param {string} slug @returns {Promise<ListingRecord|null>} */
  async findBySlug(slug) {
    throw new Error(
      'ListingRepository.findBySlug must be implemented by a concrete adapter.',
    );
  }

  /** @param {string} slug @returns {Promise<boolean>} */
  async slugExists(slug) {
    throw new Error(
      'ListingRepository.slugExists must be implemented by a concrete adapter.',
    );
  }

  /** @returns {Promise<{rows: ListingRecord[], meta: object}>} */
  async list(filters, pagination) {
    throw new Error(
      'ListingRepository.list must be implemented by a concrete adapter.',
    );
  }

  /** @param {number} id @param {object} fields @returns {Promise<ListingRecord>} */
  async update(id, fields) {
    throw new Error(
      'ListingRepository.update must be implemented by a concrete adapter.',
    );
  }

  /** @param {number} id @param {number} statusId @param {number} updatedBy @param {number|null} [publicationPeriodDays] Step B3: non-null only on a listing's first lifecycle-managed publish. @returns {Promise<void>} */
  async markPublished(id, statusId, updatedBy, publicationPeriodDays = null) {
    throw new Error(
      'ListingRepository.markPublished must be implemented by a concrete adapter.',
    );
  }

  /** @param {number} id @param {number} statusId @param {number} updatedBy @returns {Promise<void>} */
  async markUnpublished(id, statusId, updatedBy) {
    throw new Error(
      'ListingRepository.markUnpublished must be implemented by a concrete adapter.',
    );
  }

  /** @param {number} id @param {number} deletedByUserId @returns {Promise<void>} */
  async softDelete(id, deletedByUserId) {
    throw new Error(
      'ListingRepository.softDelete must be implemented by a concrete adapter.',
    );
  }

  /** Step B4: the scheduled expiry sweep's guarded UPDATE — see the MySQL adapter for the exact idempotency/race-safety contract. @param {{publishedStatusId: number, unpublishedStatusId: number}} ids @returns {Promise<number>} how many listings this run froze */
  async freezeExpiredListings({ publishedStatusId, unpublishedStatusId }) {
    throw new Error(
      'ListingRepository.freezeExpiredListings must be implemented by a concrete adapter.',
    );
  }

  /** Step B5: the ACTIVE-renewal guarded UPDATE (extends from the current `expires_at`) — see the MySQL adapter for the exact idempotency/race-safety contract. @returns {Promise<number>} 0 or 1 */
  async extendActivePublication({
    id,
    publishedStatusId,
    publicationPeriodDays,
    updatedBy,
  }) {
    throw new Error(
      'ListingRepository.extendActivePublication must be implemented by a concrete adapter.',
    );
  }

  /** Step B5: the FROZEN-renewal guarded UPDATE (extends from `NOW()`) — see the MySQL adapter for the exact idempotency/race-safety contract. @returns {Promise<number>} 0 or 1 */
  async reactivateExpiredPublication({
    id,
    publishedStatusId,
    publicationPeriodDays,
    updatedBy,
  }) {
    throw new Error(
      'ListingRepository.reactivateExpiredPublication must be implemented by a concrete adapter.',
    );
  }

  /** Step B6: candidate rows currently inside the T-2-day reminder window and not yet reminded this cycle — read-only, the actual claim happens per-row in `claimExpiryReminder`. @returns {Promise<object[]>} */
  async listDueForReminder({ publishedStatusId, defaultLanguageId }) {
    throw new Error(
      'ListingRepository.listDueForReminder must be implemented by a concrete adapter.',
    );
  }

  /** Step B6: the per-row guarded UPDATE that atomically claims a single listing's expiry reminder — see the MySQL adapter for the exact idempotency/race-safety contract. @returns {Promise<number>} 0 or 1 */
  async claimExpiryReminder({ id, publishedStatusId }) {
    throw new Error(
      'ListingRepository.claimExpiryReminder must be implemented by a concrete adapter.',
    );
  }

  /** @param {number} listingId @param {string} oldSlug @returns {Promise<void>} */
  async recordSlugHistory(listingId, oldSlug) {
    throw new Error(
      'ListingRepository.recordSlugHistory must be implemented by a concrete adapter.',
    );
  }

  /** @param {number} listingId @returns {Promise<object[]>} */
  async listMedia(listingId) {
    throw new Error(
      'ListingRepository.listMedia must be implemented by a concrete adapter.',
    );
  }

  /** @returns {Promise<object>} the inserted media row */
  async attachMedia(data) {
    throw new Error(
      'ListingRepository.attachMedia must be implemented by a concrete adapter.',
    );
  }

  /** @param {number} mediaId @param {object} fields @returns {Promise<object>} */
  async updateMedia(mediaId, fields) {
    throw new Error(
      'ListingRepository.updateMedia must be implemented by a concrete adapter.',
    );
  }

  /** @param {number} mediaId @returns {Promise<void>} */
  async removeMedia(mediaId) {
    throw new Error(
      'ListingRepository.removeMedia must be implemented by a concrete adapter.',
    );
  }

  /** @param {number} mediaId @returns {Promise<object|null>} */
  async findMediaById(mediaId) {
    throw new Error(
      'ListingRepository.findMediaById must be implemented by a concrete adapter.',
    );
  }

  /**
   * @param {number} partnerId
   * @returns {Promise<{exists: boolean, verificationStatusCode: string|null}>}
   */
  async getPartnerVerification(partnerId) {
    throw new Error(
      'ListingRepository.getPartnerVerification must be implemented by a concrete adapter.',
    );
  }

  /** @param {string} code @returns {Promise<number|null>} */
  async findListingTypeIdByCode(code) {
    throw new Error(
      'ListingRepository.findListingTypeIdByCode must be implemented by a concrete adapter.',
    );
  }

  /** @param {string} code @returns {Promise<number|null>} */
  async findStatusIdByCode(code) {
    throw new Error(
      'ListingRepository.findStatusIdByCode must be implemented by a concrete adapter.',
    );
  }

  /** @param {string} code @returns {Promise<number|null>} */
  async findModerationStatusIdByCode(code) {
    throw new Error(
      'ListingRepository.findModerationStatusIdByCode must be implemented by a concrete adapter.',
    );
  }
}
/* eslint-enable class-methods-use-this, no-unused-vars */

export default ListingRepository;
