/**
 * Makes a fixture listing bookable: only a PUBLISHED listing accepts holds
 * and bookings (`ListingService#assertBookable`). Suites that test the
 * booking path — not publication — mark their listing published directly,
 * rather than satisfying every publish-readiness requirement.
 */

import { getMysqlPool } from '../../../src/infrastructure/database/mysqlPool.js';

export async function markListingBookable(listingId) {
  await getMysqlPool().query(
    "UPDATE listings SET status_id = (SELECT id FROM listing_statuses WHERE code = 'PUBLISHED') WHERE id = ?",
    [listingId],
  );
}

export default markListingBookable;
