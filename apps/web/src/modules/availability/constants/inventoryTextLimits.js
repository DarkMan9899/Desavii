/**
 * Maximum lengths of Partner-entered inventory text — mirrors
 * `availabilityValidators.js` (`createManualBlockSchema`,
 * `createExternalReservationSchema`), each matching its migration-0025
 * VARCHAR column.
 */

export const INVENTORY_TEXT_MAX_LENGTH = Object.freeze({
  blockNotes: 500,
  externalReference: 120,
  guestName: 150,
  guestPhone: 40,
});

export default INVENTORY_TEXT_MAX_LENGTH;
