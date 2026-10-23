import { describe, test, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ListingAmenitiesSection from './ListingAmenitiesSection.jsx';

const amenity = (value, key, label) => ({ value, key, code: label });

// Twelve amenities across two groups, only three of them "popular".
const LONG_CATALOG = [
  {
    code: 'INTERNET_WORK',
    amenities: [
      amenity(1, 'WIFI', 'WiFi'),
      amenity(2, 'DEDICATED_WORKSPACE', 'Workspace'),
      amenity(3, 'PRINTER', 'Printer'),
      amenity(4, 'MEETING_ROOM', 'Meeting room'),
      amenity(5, 'FAST_INTERNET', 'Fast internet'),
      amenity(6, 'BUSINESS_CENTRE', 'Business centre'),
    ],
  },
  {
    code: 'OUTDOOR',
    amenities: [
      amenity(7, 'GARDEN', 'Garden'),
      amenity(8, 'BBQ', 'Barbecue'),
      amenity(9, 'HAMMOCK', 'Hammock'),
      amenity(10, 'FIRE_PIT', 'Fire pit'),
      amenity(11, 'SUN_LOUNGERS', 'Sun loungers'),
      amenity(12, 'OUTDOOR_SHOWER', 'Outdoor shower'),
    ],
  },
];
const ALL_IDS = Array.from({ length: 12 }, (_, i) => i + 1);

describe('ListingAmenitiesSection (Listing Details)', () => {
  test('renders nothing when the category has no amenity groups', () => {
    const { container } = render(
      <ListingAmenitiesSection amenityGroups={[]} amenityIds={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when none of the listing amenity_ids match this category', () => {
    const { container } = render(
      <ListingAmenitiesSection
        amenityGroups={[
          { code: 'INTERNET_WORK', amenities: [amenity(1, 'WIFI', 'WiFi')] },
        ]}
        amenityIds={[999]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('a short list is shown in full as one flat grid, without group headings or a dialog', () => {
    render(
      <ListingAmenitiesSection
        amenityGroups={[
          { code: 'INTERNET_WORK', amenities: [amenity(1, 'WIFI', 'WiFi')] },
          { code: 'WELLNESS', amenities: [amenity(2, 'POOL', 'Pool')] },
        ]}
        amenityIds={[1]}
        sectionId="amenities"
      />,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Հարմարություններ' }),
    ).toHaveAttribute('id', 'amenities');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('WiFi')).toBeInTheDocument();
    expect(screen.queryByText('Pool')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Ինտերնետ և աշխատանք' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('a long list with few popular amenities shows the first ones and opens the complete grouped list in a dialog', async () => {
    const user = userEvent.setup();
    render(
      <ListingAmenitiesSection
        amenityGroups={LONG_CATALOG}
        amenityIds={ALL_IDS}
      />,
    );
    // Only 3 of the 12 are popular (fewer than half of 8): the first 8 show.
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
    expect(screen.queryByText('Outdoor shower')).not.toBeInTheDocument();

    const showAll = screen.getByRole('button', {
      name: 'Ցույց տալ բոլոր 12 հարմարությունները',
    });
    expect(showAll).toHaveAttribute('aria-haspopup', 'dialog');
    await user.click(showAll);

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Ինտերնետ և աշխատանք' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Outdoor shower')).toBeInTheDocument();
  });

  test('a long list with enough popular amenities leads with them, in popularity order', () => {
    const catalog = [
      {
        code: 'GENERAL',
        amenities: [
          amenity(1, 'ELEVATOR', 'Elevator'),
          amenity(2, 'POOL', 'Pool'),
          amenity(3, 'WIFI', 'WiFi'),
          amenity(4, 'PARKING', 'Parking'),
          amenity(5, 'KITCHEN', 'Kitchen'),
          amenity(6, 'IRON', 'Iron'),
          amenity(7, 'HAIRDRYER', 'Hairdryer'),
          amenity(8, 'SAFE', 'Safe'),
          amenity(9, 'TOWELS', 'Towels'),
          amenity(10, 'LINENS', 'Linens'),
          amenity(11, 'HEATING', 'Heating'),
        ],
      },
    ];
    render(
      <ListingAmenitiesSection
        amenityGroups={catalog}
        amenityIds={Array.from({ length: 11 }, (_, i) => i + 1)}
      />,
    );
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['WiFi', 'Parking', 'Pool', 'Kitchen']);
  });

  test('uses the category heading when one is given', () => {
    render(
      <ListingAmenitiesSection
        amenityGroups={[
          {
            code: 'VEHICLE',
            amenities: [amenity(1, 'GPS_NAVIGATION', 'GPS')],
          },
        ]}
        amenityIds={[1]}
        headingKey="pages.listingDetail.amenities.headingVehicle"
      />,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Հագեցվածություն' }),
    ).toBeInTheDocument();
  });
});
