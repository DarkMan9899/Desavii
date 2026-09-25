/**
 * BookableUnitService — public Service for `bookable_units` (Module
 * Catalog #15). The extension seam a future Hotels/Tours module calls
 * directly (the same cross-module Service-dependency pattern as
 * `AvailabilityService` depending on `ListingService`) once it has real
 * inventory rows to register — passing real `sourceTable`/`sourceId`
 * instead of this sprint's own `registerUnit` default
 * (`sourceTable: 'listings'`, `sourceId: listingId`, an explicit,
 * documented placeholder for "the listing considered as its own single
 * unit," per the Sprint 9 plan).
 *
 * No ownership/visibility checks here — this Service is a thin, reusable
 * persistence seam; the caller (`AvailabilityService`, or a future
 * per-type module's own Service) is responsible for authorizing the
 * listing first, exactly like `ListingRepository` doesn't re-check
 * ownership either.
 */

import { ValidationError } from '../../../errors/AppError.js';

const DEFAULT_SOURCE_TABLE = 'listings';
const DEFAULT_CAPACITY = 1;

export class BookableUnitService {
  #bookableUnitRepository;

  constructor({ bookableUnitRepository }) {
    this.#bookableUnitRepository = bookableUnitRepository;
  }

  /**
   * Idempotent find-or-create keyed on `(listingId, bookableUnitTypeCode,
   * sourceTable, sourceId)`.
   */
  async registerUnit({
    listingId,
    bookableUnitTypeCode,
    capacity = DEFAULT_CAPACITY,
    sourceTable = DEFAULT_SOURCE_TABLE,
    sourceId,
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
  }) {
    const resolvedSourceId = sourceId ?? listingId;

    const bookableUnitTypeId =
      await this.#bookableUnitRepository.findTypeIdByCode(bookableUnitTypeCode);
    if (!bookableUnitTypeId) {
      throw new ValidationError('Unknown bookable unit type.', [
        { field: 'bookableUnitType', issue: 'UNKNOWN_BOOKABLE_UNIT_TYPE' },
      ]);
    }

    const existing = await this.#bookableUnitRepository.findMatching({
      listingId,
      bookableUnitTypeId,
      sourceTable,
      sourceId: resolvedSourceId,
      unitLabel,
    });
    if (existing) return existing;

    return this.#bookableUnitRepository.create({
      listingId,
      bookableUnitTypeId,
      sourceTable,
      sourceId: resolvedSourceId,
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
    });
  }

  async findById(id) {
    return this.#bookableUnitRepository.findById(id);
  }

  async listUnitsForListing(listingId) {
    return this.#bookableUnitRepository.listForListing(listingId);
  }

  async retireUnit(id, deletedBy) {
    await this.#bookableUnitRepository.softDelete(id, deletedBy);
  }

  /**
   * Editable fields for an already-existing unit — label, capacity
   * (inventory quantity), occupancy/bed structure, and base price.
   * `bookableUnitTypeCode`/`sourceTable`/`sourceId` are deliberately not
   * editable here: changing a unit's TYPE post-creation has real
   * booking-history implications (`bookings.booking_type_id` is resolved
   * from it) that are out of P2.2A's scope.
   */
  async updateUnit(id, fields) {
    return this.#bookableUnitRepository.update(id, fields);
  }

  // --- Sprint C-1: room description, amenities, media — no ownership
  // checks here either, same "thin persistence seam" rule this whole
  // Service already follows; the caller (AvailabilityService) authorizes
  // the unit's listing first. ---

  async listTranslations(id) {
    return this.#bookableUnitRepository.listTranslations(id);
  }

  async setDescription(id, languageId, description) {
    await this.#bookableUnitRepository.upsertTranslation(
      id,
      languageId,
      description,
    );
    return this.#bookableUnitRepository.listTranslations(id);
  }

  async listAmenityIds(id) {
    return this.#bookableUnitRepository.listAmenityIds(id);
  }

  async replaceAmenities(id, amenityIds) {
    await this.#bookableUnitRepository.replaceAmenities(id, amenityIds);
    return this.#bookableUnitRepository.listAmenityIds(id);
  }

  async listMedia(id) {
    return this.#bookableUnitRepository.listMedia(id);
  }

  async findMediaById(mediaId) {
    return this.#bookableUnitRepository.findMediaById(mediaId);
  }

  /**
   * Step L3.1 — `connection` is optional and forwarded as-is; passed by
   * `AvailabilityService#attachUnitMedia` when it needs this insert to
   * run on the same row-locked transaction as `lockById` below, omitted
   * by any other caller (falls back to the repository's own pooled
   * connection default).
   */
  async attachMedia(fields, connection) {
    return this.#bookableUnitRepository.attachMedia(fields, connection);
  }

  async removeMedia(mediaId, deletedBy) {
    await this.#bookableUnitRepository.removeMedia(mediaId, deletedBy);
  }

  /** Step L3.1 — thin pass-through to `lockById`; always call inside `withTransaction`. */
  async lockById(id, connection) {
    return this.#bookableUnitRepository.lockById(id, connection);
  }
}

export default BookableUnitService;
