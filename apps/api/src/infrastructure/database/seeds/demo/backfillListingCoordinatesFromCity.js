/**
 * backfillListingCoordinatesFromCity — Pass 3 remediation (Map data
 * contract).
 *
 * `listingService.js`'s `#checkPublishReadiness` already REQUIRES real
 * coordinates before a listing can publish through the real service
 * (`COMPLETE_LOCATION_REQUIRED`) — the demo/dev catalog only ended up
 * 100% coordinate-less because the seed scripts insert `listing_locations`
 * rows directly (bypassing that service call entirely, the same way every
 * other seeded field bypasses normal write paths) and never set them.
 *
 * This does not invent addresses. `cities` already carries a real,
 * known centroid `latitude`/`longitude` for every city the demo catalog
 * uses (`seeds/002_geography.js`) — every seeded listing already has a
 * real `city_id`, so setting a listing's coordinates to its own city's
 * centroid is a legitimate, non-fabricated backfill (city-level
 * precision, not a fake street address) for local/dev data only. This
 * is NEVER run against production — it is wired only into the demo seed
 * CLI scripts (`db:seed:demo`, `db:seed:demo:dev`), which already refuse
 * to target a production database.
 */

export default async function backfillListingCoordinatesFromCity(connection) {
  const [result] = await connection.query(
    `UPDATE listing_locations ll
     JOIN cities c ON c.id = ll.city_id
     SET ll.latitude = c.latitude, ll.longitude = c.longitude
     WHERE ll.city_id IS NOT NULL
       AND (ll.latitude IS NULL OR ll.longitude IS NULL)
       AND c.latitude IS NOT NULL
       AND c.longitude IS NOT NULL`,
  );
  return { backfilledRows: result.affectedRows };
}
