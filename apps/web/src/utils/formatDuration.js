/**
 * formatDurationLabel — a duration in minutes as a guest reads it: whole
 * hours as hours ("3 hours"), anything else as minutes ("90 minutes").
 * Shared by the Search/Favorites card chip and the Listing Detail key
 * facts, so the same listing never reads differently on the two.
 *
 * @param {number} minutes
 * @param {Function} t - i18next `t`
 * @returns {string}
 */
export function formatDurationLabel(minutes, t) {
  const hours = Math.floor(minutes / 60);
  return hours >= 1 && minutes % 60 === 0
    ? t('search.card.durationHours', { count: hours })
    : t('search.card.durationMinutes', { count: minutes });
}

export default formatDurationLabel;
