/**
 * The city a publishable test listing is placed in. A listing must name a
 * city to publish (`ListingService.#checkPublishReadiness`
 * `CITY_REQUIRED`), and every fixture that publishes at Yerevan's
 * coordinates also names Yerevan.
 *
 * Deterministic: `globalSetup` recreates the test database once per run
 * and `seeds/002_reference_data.js` inserts Yerevan as its first city,
 * so its id is 1 (the same id `listingCrud.test.js` already relied on).
 */
export const YEREVAN_CITY_ID = 1;

export default { YEREVAN_CITY_ID };
