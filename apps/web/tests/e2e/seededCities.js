/**
 * The city a publishable e2e listing is placed in. A listing must name a
 * city to publish (`ListingService.#checkPublishReadiness` `CITY_REQUIRED`),
 * so every spec that publishes at Yerevan's coordinates also names Yerevan.
 *
 * Deterministic: the suite runs against `travelhub_test` freshly rebuilt by
 * `npm run db:seed:demo`, and `seeds/002_reference_data.js` inserts Yerevan
 * as its first city (mirrors the API integration suite's own
 * `tests/integration/helpers/seededCities.js`).
 */
export const YEREVAN_CITY_ID = 1;
