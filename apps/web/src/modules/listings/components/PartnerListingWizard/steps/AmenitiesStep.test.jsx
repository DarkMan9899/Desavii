import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AmenitiesStep from './AmenitiesStep.jsx';
import { useListingMetadataQuery } from '../../../queries/useListingMetadataQuery.js';
import { useUpdateListingMutation } from '../../../mutations/useUpdateListingMutation.js';

vi.mock('../../../queries/useListingMetadataQuery.js', () => ({
  useListingMetadataQuery: vi.fn(),
}));
vi.mock('../../../mutations/useUpdateListingMutation.js', () => ({
  useUpdateListingMutation: vi.fn(),
}));

const AMENITY_GROUPS = [
  {
    code: 'GENERAL',
    amenities: [
      { value: 1, code: 'WiFi' },
      { value: 2, code: 'Parking' },
    ],
  },
  {
    code: 'OUTDOOR',
    amenities: [{ value: 3, code: 'Pool' }],
  },
];

describe('AmenitiesStep (PartnerListingWizard)', () => {
  let mutateAsync;

  beforeEach(() => {
    mutateAsync = vi.fn().mockResolvedValue({ data: {} });
    useUpdateListingMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: null,
    });
  });

  test('renders a loading spinner while metadata is pending', () => {
    useListingMetadataQuery.mockReturnValue({ isPending: true });
    render(<AmenitiesStep listingId={7} categoryId={3} onNext={vi.fn()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('renders every amenity, grouped, with the amenity name shown as-is', () => {
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { amenity_groups: AMENITY_GROUPS },
    });
    render(<AmenitiesStep listingId={7} categoryId={3} onNext={vi.fn()} />);
    expect(screen.getByText('WiFi')).toBeInTheDocument();
    expect(screen.getByText('Parking')).toBeInTheDocument();
    expect(screen.getByText('Pool')).toBeInTheDocument();
  });

  test('the search box filters amenities across groups', async () => {
    const user = userEvent.setup();
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { amenity_groups: AMENITY_GROUPS },
    });
    render(<AmenitiesStep listingId={7} categoryId={3} onNext={vi.fn()} />);

    await user.type(screen.getByLabelText('Փնտրել հարմարություններ'), 'wifi');
    expect(screen.getByText('WiFi')).toBeInTheDocument();
    expect(screen.queryByText('Parking')).not.toBeInTheDocument();
    expect(screen.queryByText('Pool')).not.toBeInTheDocument();
  });

  test('a group header toggles collapse/expand of its amenities', async () => {
    const user = userEvent.setup();
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { amenity_groups: AMENITY_GROUPS },
    });
    render(<AmenitiesStep listingId={7} categoryId={3} onNext={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Ընդհանուր' }));
    expect(screen.queryByText('WiFi')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ընդհանուր' }));
    expect(screen.getByText('WiFi')).toBeInTheDocument();
  });

  test('pre-selected amenities (editing a draft) start checked', () => {
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { amenity_groups: AMENITY_GROUPS },
    });
    render(
      <AmenitiesStep
        listingId={7}
        categoryId={3}
        initialValues={[1]}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('WiFi')).toBeChecked();
    expect(screen.getByLabelText('Parking')).not.toBeChecked();
  });

  test('toggling amenities and continuing calls updateListing with amenityIds', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { amenity_groups: AMENITY_GROUPS },
    });
    render(
      <AmenitiesStep
        listingId={7}
        categoryId={3}
        initialValues={[1]}
        onNext={onNext}
      />,
    );

    await user.click(screen.getByLabelText('Pool'));
    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const call = mutateAsync.mock.calls[0][0];
    expect(call.id).toBe(7);
    expect(call.payload.amenityIds.sort()).toEqual([1, 3]);
    expect(onNext).toHaveBeenCalled();
  });

  // Step L6.1: a stored amenity the category no longer offers (id 9,
  // "Jacuzzi") is kept until the Partner removes it, and shown in its own
  // section — never among the category's selectable amenities.
  describe('previously saved amenities outside the category (Step L6.1)', () => {
    const AMENITY_CATALOG = [
      { value: 1, code: 'WiFi' },
      { value: 2, code: 'Parking' },
      { value: 3, code: 'Pool' },
      { value: 9, code: 'Jacuzzi' },
    ];

    function renderWithLegacy(onNext = vi.fn()) {
      useListingMetadataQuery.mockReturnValue({
        isPending: false,
        isError: false,
        data: {
          amenity_groups: AMENITY_GROUPS,
          amenity_catalog: AMENITY_CATALOG,
        },
      });
      render(
        <AmenitiesStep
          listingId={7}
          categoryId={3}
          initialValues={[1, 9]}
          onNext={onNext}
        />,
      );
    }

    test('is shown checked in a separate, explained section', () => {
      renderWithLegacy();
      const section = screen.getByRole('group', {
        name: 'Նախկինում պահպանված',
      });
      expect(section).toHaveAccessibleDescription(
        /Սրանք այլևս հասանելի չեն այս կատեգորիայի համար/,
      );
      expect(screen.getByLabelText('Jacuzzi')).toBeChecked();
      expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    });

    test('saving without touching it keeps it', async () => {
      const user = userEvent.setup();
      renderWithLegacy();
      await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
      expect(mutateAsync.mock.calls[0][0].payload.amenityIds.sort()).toEqual([
        1, 9,
      ]);
    });

    test('unchecking removes it on save and it cannot be re-added', async () => {
      const user = userEvent.setup();
      renderWithLegacy();

      await user.click(screen.getByLabelText('Jacuzzi'));
      const removed = screen.getByLabelText('Jacuzzi — կհեռացվի պահպանելիս');
      expect(removed).not.toBeChecked();
      expect(removed).toBeDisabled();

      await user.click(screen.getByRole('button', { name: 'Շարունակել' }));
      await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
      expect(mutateAsync.mock.calls[0][0].payload.amenityIds).toEqual([1]);
    });

    test('an amenity the category does not offer is never selectable', () => {
      useListingMetadataQuery.mockReturnValue({
        isPending: false,
        isError: false,
        data: {
          amenity_groups: AMENITY_GROUPS,
          amenity_catalog: AMENITY_CATALOG,
        },
      });
      render(
        <AmenitiesStep
          listingId={7}
          categoryId={3}
          initialValues={[1]}
          onNext={vi.fn()}
        />,
      );
      expect(screen.queryByText('Jacuzzi')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('group', { name: 'Նախկինում պահպանված' }),
      ).not.toBeInTheDocument();
    });
  });
});
