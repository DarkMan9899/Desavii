import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ListingLocationSection from './ListingLocationSection.jsx';

// ListingLocationSection lazy-loads the real ListingMap (Leaflet +
// react-leaflet + CSS + marker images) so the Partner Wizard's bundle never
// pays for map code it doesn't use — see this file's own header comment.
// That real dynamic import is already fully covered by
// ListingMap.test.jsx's own static (non-lazy) import; re-paying its real
// module-load cost here just to prove the Suspense/lazy WIRING works made
// this suite genuinely flaky under full-suite parallel load (passes in
// ~300ms alone, but the real import() can exceed the default 1000ms
// waitFor timeout under CPU contention from hundreds of concurrent test
// files). Mocking the already-tested heavy dependency removes that
// unrelated timing sensitivity while still exercising the real
// lazy()/Suspense integration and prop-forwarding this test is meant to
// verify.
vi.mock('../ListingMap/ListingMap.jsx', () => ({
  default: function MockListingMap({ popupLabel }) {
    return (
      <div role="region" aria-label={popupLabel}>
        Map
      </div>
    );
  },
}));

describe('ListingLocationSection (Listing Details)', () => {
  test('renders nothing when the listing has no location', () => {
    const { container } = render(
      <ListingLocationSection location={null} title="Villa" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('renders the city/country text even without coordinates', () => {
    render(
      <ListingLocationSection
        location={{
          city_name: 'Yerevan',
          country_name: 'Armenia',
          latitude: null,
          longitude: null,
        }}
        title="Villa"
      />,
    );
    expect(screen.getByText('Yerevan, Armenia')).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: /Villa/ }),
    ).not.toBeInTheDocument();
  });

  test('leads with the street address when the API sends one (a public venue)', () => {
    render(
      <ListingLocationSection
        location={{
          address_line: '12 Charents St',
          city_name: 'Garni',
          country_name: 'Armenia',
          latitude: null,
          longitude: null,
        }}
        title="Garni Tavern"
      />,
    );
    expect(
      screen.getByText('12 Charents St, Garni, Armenia'),
    ).toBeInTheDocument();
  });

  test('renders the map when coordinates are present (ListingMap is lazy-loaded)', async () => {
    render(
      <ListingLocationSection
        location={{
          city_name: 'Yerevan',
          country_name: 'Armenia',
          latitude: 40.1872,
          longitude: 44.5152,
        }}
        title="Villa"
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: 'Villa, Yerevan, Armenia' }),
      ).toBeInTheDocument(),
    );
  });
});
