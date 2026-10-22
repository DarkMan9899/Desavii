/**
 * ListingLocationSection — city/country text (from `listingDto.js`'s new
 * `city_name`/`country_name`, Phase 6's own backend extension) alongside
 * `ListingMap`. The text line is not merely decorative: it's the
 * section's accessible text-equivalent for the map (per
 * UI_UX_GUIDELINES's accessibility rules — a visual-only map would leave
 * a screen-reader user with nothing), so it renders even when
 * coordinates are missing and the map itself can't.
 *
 * The street address (`address_line`) leads that line when the API sends
 * it — a venue's address is public, while a private stay's is withheld
 * (`listingDto.toListingResponse`) to match its approximate public map.
 *
 * `ListingMap` is `lazy()`-loaded rather than statically imported:
 * `pages/ListingDetailPage.jsx` reaches this component through
 * `modules/listings/index.js`'s shared public barrel (FRONTEND_
 * ARCHITECTURE.md §6.3's required cross-module import path) — a barrel
 * that also exports `PartnerListingWizard`. A static import of `leaflet`/
 * `react-leaflet` (plus their `L.Icon.Default.mergeOptions` module-level
 * side effect) would otherwise land in whatever chunk that shared barrel
 * resolves to, bloating the Partner Wizard's bundle with map code it
 * never uses. `lazy()` gives it its own chunk, fetched only when a
 * listing with coordinates actually renders this section.
 */

import { lazy, Suspense } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Section, Stack } from '@desavii/ui/components/layout';
import { Spinner } from '@desavii/ui/components/feedback-overlays';

const ListingMap = lazy(() => import('../ListingMap/ListingMap.jsx'));

export default function ListingLocationSection({
  location = null,
  title = undefined,
  sectionId = undefined,
}) {
  const { t } = useTranslation();

  if (!location) return null;

  const cityCountry = [location.city_name, location.country_name]
    .filter(Boolean)
    .join(', ');
  const fullAddress = [location.address_line, cityCountry]
    .filter(Boolean)
    .join(', ');
  const hasCoordinates =
    typeof location.latitude === 'number' &&
    typeof location.longitude === 'number';

  if (!fullAddress && !hasCoordinates) return null;

  return (
    <Section
      spacing="none"
      aria-label={t('pages.listingDetail.location.heading')}
    >
      <h2 id={sectionId}>{t('pages.listingDetail.location.heading')}</h2>
      <Stack gap="3">
        {fullAddress && <p>{fullAddress}</p>}
        {hasCoordinates && (
          <Suspense
            fallback={<Spinner label={t('pages.listingDetail.loading')} />}
          >
            <ListingMap
              latitude={location.latitude}
              longitude={location.longitude}
              popupLabel={[title, fullAddress].filter(Boolean).join(', ')}
            />
          </Suspense>
        )}
      </Stack>
    </Section>
  );
}

ListingLocationSection.propTypes = {
  location: PropTypes.shape({
    address_line: PropTypes.string,
    city_name: PropTypes.string,
    country_name: PropTypes.string,
    latitude: PropTypes.number,
    longitude: PropTypes.number,
  }),
  title: PropTypes.string,
  sectionId: PropTypes.string,
};
