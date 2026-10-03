/**
 * The one human-readable rendering of a room's sleeping setup
 * (`bed_configuration`: `[{type, count}]`), used wherever beds are shown —
 * the public room card/detail, the reservation widget's room picker, the
 * Partner's room list and admin listing detail.
 *
 * Step L6.3A: natural, pluralized phrases per bed type
 * (`pages.listingDetail.rooms.bedCounts.<TYPE>` — "1 double bed",
 * "2 single beds", "1 child bed available"), never "2 × Single". A zero or
 * missing count is never shown; an absent setup renders nothing.
 */

/** @returns {string[]} one phrase per bed type present, in stored order. */
export function describeBedConfiguration(t, bedConfiguration) {
  return (bedConfiguration ?? [])
    .filter((row) => row.count > 0)
    .map((row) =>
      t(`pages.listingDetail.rooms.bedCounts.${row.type}`, {
        count: row.count,
      }),
    );
}

/** @returns {string|null} the whole setup on one line, or `null` when none is stated. */
export function formatBedConfiguration(t, bedConfiguration) {
  const phrases = describeBedConfiguration(t, bedConfiguration);
  return phrases.length > 0 ? phrases.join(', ') : null;
}

export default { describeBedConfiguration, formatBedConfiguration };
