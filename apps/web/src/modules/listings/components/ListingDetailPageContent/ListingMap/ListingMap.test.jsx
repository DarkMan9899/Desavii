import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ListingMap from './ListingMap.jsx';
import { APPROXIMATE_RADIUS_METERS } from '../../../../../utils/mapPresentation.js';

// jsdom has neither SVG geometry nor canvas, so Leaflet cannot draw a
// vector layer here; the circle is stood in for and its props checked
// (the real drawing is verified in the browser).
vi.mock('react-leaflet', async (importOriginal) => ({
  ...(await importOriginal()),
  // eslint-disable-next-line react/prop-types -- trivial test double
  Circle: ({ center: [latitude, longitude], radius }) => (
    <div
      data-testid="approximate-area"
      data-center={`${latitude},${longitude}`}
      data-radius={radius}
    />
  ),
}));

describe('ListingMap (PartnerListingWizard/Listing Details)', () => {
  test('renders a map region with the given popup label as its accessible name', () => {
    render(
      <ListingMap
        latitude={40.1872}
        longitude={44.5152}
        popupLabel="Villa in Yerevan, Armenia"
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Villa in Yerevan, Armenia' }),
    ).toBeInTheDocument();
  });

  test('clicking the marker opens a popup with the label', async () => {
    const user = userEvent.setup();
    render(
      <ListingMap
        latitude={40.1872}
        longitude={44.5152}
        popupLabel="Villa in Yerevan, Armenia"
      />,
    );

    expect(
      screen.queryByText('Villa in Yerevan, Armenia'),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Marker' }));
    expect(screen.getByText('Villa in Yerevan, Armenia')).toBeInTheDocument();
  });

  // Listing Detail rebuild: an approximate (private-stay) point is drawn as
  // an area, never as a pin a guest would read as the exact address.
  test('an approximate location is an area, not a marker', () => {
    render(
      <ListingMap
        latitude={40.175}
        longitude={44.505}
        popupLabel="Villa in Yerevan, Armenia"
        isApproximate
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Marker' }),
    ).not.toBeInTheDocument();
    const area = screen.getByTestId('approximate-area');
    expect(area).toHaveAttribute('data-center', '40.175,44.505');
    expect(area).toHaveAttribute(
      'data-radius',
      String(APPROXIMATE_RADIUS_METERS),
    );
  });
});
