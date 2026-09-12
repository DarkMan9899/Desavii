import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PartnerListingRowActions from './PartnerListingRowActions.jsx';

// Same real, pure domain logic mocked the same way
// `PartnerListingsList.test.jsx` mocks it — this component imports it
// from the same `../../../listings/index.js` module.
vi.mock('../../../listings/index.js', () => {
  const PRESENTATION_GROUPS = Object.freeze({
    ACCOMMODATION: 'ACCOMMODATION',
    DINING: 'DINING',
    EXPERIENCE: 'EXPERIENCE',
    GENERIC: 'GENERIC',
  });
  // Pass 10 (Attraction vertical completion) — extended with DINING/
  // EXPERIENCE (mirroring the real `resolvePresentationGroup`'s own
  // HOTEL/PROPERTY->ACCOMMODATION, RESTAURANT->DINING, TOUR/ATTRACTION
  // ->EXPERIENCE mapping) so this component's own "Manage Opening Hours"
  // gating — which now checks for DINING or EXPERIENCE — is exercised by
  // real logic here, not silently short-circuited to GENERIC.
  const GROUP_BY_TYPE = {
    HOTEL: PRESENTATION_GROUPS.ACCOMMODATION,
    PROPERTY: PRESENTATION_GROUPS.ACCOMMODATION,
    RESTAURANT: PRESENTATION_GROUPS.DINING,
    TOUR: PRESENTATION_GROUPS.EXPERIENCE,
    ATTRACTION: PRESENTATION_GROUPS.EXPERIENCE,
  };
  return {
    PRESENTATION_GROUPS,
    resolvePresentationGroup: (code) =>
      GROUP_BY_TYPE[code] ?? PRESENTATION_GROUPS.GENERIC,
  };
});

function listing(overrides) {
  return {
    id: 7,
    listing_type: 'HOTEL',
    status: 'DRAFT',
    ...overrides,
  };
}

function renderActions(overrides = {}) {
  const props = {
    listing: listing(),
    isMutating: false,
    isPublishing: false,
    isUnpublishing: false,
    isArchiving: false,
    isDeleting: false,
    onView: vi.fn(),
    onEdit: vi.fn(),
    onManageRooms: vi.fn(),
    onManageMenu: vi.fn(),
    onManageOpeningHours: vi.fn(),
    onPublish: vi.fn(),
    onUnpublish: vi.fn(),
    onArchive: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(
    <PartnerListingRowActions
      listing={props.listing}
      isMutating={props.isMutating}
      isPublishing={props.isPublishing}
      isUnpublishing={props.isUnpublishing}
      isArchiving={props.isArchiving}
      isDeleting={props.isDeleting}
      onView={props.onView}
      onEdit={props.onEdit}
      onManageRooms={props.onManageRooms}
      onManageMenu={props.onManageMenu}
      onManageOpeningHours={props.onManageOpeningHours}
      onPublish={props.onPublish}
      onUnpublish={props.onUnpublish}
      onArchive={props.onArchive}
      onDelete={props.onDelete}
    />,
  );
  return props;
}

describe('PartnerListingRowActions (apps/web/src/modules/partner)', () => {
  test('View and Edit call their own callbacks with the listing', async () => {
    const user = userEvent.setup();
    const props = renderActions();
    await user.click(screen.getByRole('button', { name: 'Դիտել' }));
    expect(props.onView).toHaveBeenCalledWith(props.listing);
    await user.click(screen.getByRole('button', { name: 'Խմբագրել' }));
    expect(props.onEdit).toHaveBeenCalledWith(props.listing);
  });

  test('the "More actions" trigger is disabled while a mutation on this row is in flight', () => {
    renderActions({ isMutating: true });
    expect(
      screen.getByRole('button', { name: 'Լրացուցիչ գործողություններ' }),
    ).toBeDisabled();
  });

  test('opening the menu and choosing Publish closes the menu and calls onPublish with the listing', async () => {
    const user = userEvent.setup();
    const props = renderActions();
    await user.click(
      screen.getByRole('button', { name: 'Լրացուցիչ գործողություններ' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Հրապարակել' }));
    expect(props.onPublish).toHaveBeenCalledWith(props.listing);
    expect(
      screen.queryByRole('menuitem', { name: 'Հրապարակել' }),
    ).not.toBeInTheDocument();
  });

  describe('Pass 10 (Attraction vertical completion) — "Manage Opening Hours" gating', () => {
    test('is hidden for a HOTEL listing (ACCOMMODATION group never had it)', async () => {
      const user = userEvent.setup();
      renderActions({ listing: listing({ listing_type: 'HOTEL' }) });
      await user.click(
        screen.getByRole('button', { name: 'Լրացուցիչ գործողություններ' }),
      );
      expect(
        screen.queryByRole('menuitem', {
          name: 'Կառավարել աշխատանքային ժամերը',
        }),
      ).not.toBeInTheDocument();
    });

    test('is offered for a RESTAURANT listing (unchanged)', async () => {
      const user = userEvent.setup();
      renderActions({ listing: listing({ listing_type: 'RESTAURANT' }) });
      await user.click(
        screen.getByRole('button', { name: 'Լրացուցիչ գործողություններ' }),
      );
      expect(
        screen.getByRole('menuitem', { name: 'Կառավարել աշխատանքային ժամերը' }),
      ).toBeInTheDocument();
    });

    test('is now also offered for an ATTRACTION listing — the real "exists but partner cannot author" gap this pass closes', async () => {
      const user = userEvent.setup();
      const props = renderActions({
        listing: listing({ listing_type: 'ATTRACTION' }),
      });
      await user.click(
        screen.getByRole('button', { name: 'Լրացուցիչ գործողություններ' }),
      );
      const item = screen.getByRole('menuitem', {
        name: 'Կառավարել աշխատանքային ժամերը',
      });
      expect(item).toBeInTheDocument();
      await user.click(item);
      expect(props.onManageOpeningHours).toHaveBeenCalledWith(props.listing);
    });
  });

  test('Delete is always offered, styled as a distinct danger item', async () => {
    const user = userEvent.setup();
    renderActions({ listing: listing({ status: 'ARCHIVED' }) });
    await user.click(
      screen.getByRole('button', { name: 'Լրացուցիչ գործողություններ' }),
    );
    const deleteItem = screen.getByRole('menuitem', { name: 'Ջնջել' });
    expect(deleteItem).toBeInTheDocument();
    expect(deleteItem.className).toMatch(/menuItem--danger/);
  });
});
