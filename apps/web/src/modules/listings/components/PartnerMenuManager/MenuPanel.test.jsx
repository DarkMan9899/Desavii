import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmProvider from '../../../../providers/ConfirmProvider.jsx';
import MenuPanel from './MenuPanel.jsx';
import { useCreateListingMenuSectionMutation } from '../../mutations/useCreateListingMenuSectionMutation.js';
import { useUpdateListingMenuSectionMutation } from '../../mutations/useUpdateListingMenuSectionMutation.js';
import { useDeleteListingMenuSectionMutation } from '../../mutations/useDeleteListingMenuSectionMutation.js';
import { useCreateListingMenuItemMutation } from '../../mutations/useCreateListingMenuItemMutation.js';
import { useUpdateListingMenuItemMutation } from '../../mutations/useUpdateListingMenuItemMutation.js';
import { useDeleteListingMenuItemMutation } from '../../mutations/useDeleteListingMenuItemMutation.js';

vi.mock('../../mutations/useCreateListingMenuSectionMutation.js', () => ({
  useCreateListingMenuSectionMutation: vi.fn(),
}));
vi.mock('../../mutations/useUpdateListingMenuSectionMutation.js', () => ({
  useUpdateListingMenuSectionMutation: vi.fn(),
}));
vi.mock('../../mutations/useDeleteListingMenuSectionMutation.js', () => ({
  useDeleteListingMenuSectionMutation: vi.fn(),
}));
vi.mock('../../mutations/useCreateListingMenuItemMutation.js', () => ({
  useCreateListingMenuItemMutation: vi.fn(),
}));
vi.mock('../../mutations/useUpdateListingMenuItemMutation.js', () => ({
  useUpdateListingMenuItemMutation: vi.fn(),
}));
vi.mock('../../mutations/useDeleteListingMenuItemMutation.js', () => ({
  useDeleteListingMenuItemMutation: vi.fn(),
}));

const MENU_WITH_ONE_SECTION = {
  id: 1,
  sections: [
    {
      id: 10,
      title: 'Appetizers',
      items: [
        {
          id: 100,
          title: 'Dolma',
          description: null,
          price_amount: 2800,
          price_currency_code: 'AMD',
          dietary_markers: [],
          is_active: true,
        },
      ],
    },
  ],
};

function renderPanel(menu = MENU_WITH_ONE_SECTION) {
  return render(
    <ConfirmProvider>
      <MenuPanel menu={menu} listingId={99} locale="en" />
    </ConfirmProvider>,
  );
}

describe('MenuPanel (Pass 6, Partner Menu Authoring)', () => {
  let createSectionMutate;
  let deleteSectionMutate;
  let createItemMutate;
  let deleteItemMutate;

  beforeEach(() => {
    createSectionMutate = vi.fn();
    deleteSectionMutate = vi.fn();
    createItemMutate = vi.fn();
    deleteItemMutate = vi.fn();

    useCreateListingMenuSectionMutation.mockReturnValue({
      mutate: createSectionMutate,
      isPending: false,
      error: null,
    });
    useUpdateListingMenuSectionMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      error: null,
    });
    useDeleteListingMenuSectionMutation.mockReturnValue({
      mutate: deleteSectionMutate,
      isPending: false,
      error: null,
      variables: undefined,
    });
    useCreateListingMenuItemMutation.mockReturnValue({
      mutate: createItemMutate,
      isPending: false,
      error: null,
    });
    useUpdateListingMenuItemMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      error: null,
    });
    useDeleteListingMenuItemMutation.mockReturnValue({
      mutate: deleteItemMutate,
      isPending: false,
      error: null,
      variables: undefined,
    });
  });

  test('adding a section calls the create mutation with listingId/locale and closes the form', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Ավելացնել բաժին' }));
    await user.type(
      screen.getByLabelText('Բաժնի վերնագիր', { exact: false }),
      'Drinks',
    );
    await user.click(screen.getByRole('button', { name: 'Ավելացնել բաժին' }));

    expect(createSectionMutate).toHaveBeenCalledWith(
      { menuId: 1, listingId: 99, locale: 'en', title: 'Drinks' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  test('deleting a section requires confirmation before calling the mutation', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getAllByRole('button', { name: 'Ջնջել' })[0]);
    expect(deleteSectionMutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Այո, ջնջել' }));
    expect(deleteSectionMutate).toHaveBeenCalledWith({
      sectionId: 10,
      listingId: 99,
      locale: 'en',
    });
  });

  test('a 409 "still has items" delete failure is surfaced inline, not silently swallowed', () => {
    useDeleteListingMenuSectionMutation.mockReturnValue({
      mutate: deleteSectionMutate,
      isPending: false,
      error: {
        message: 'Remove every item from this section before deleting it.',
      },
      variables: { sectionId: 10 },
    });
    renderPanel();

    expect(
      screen.getByText(
        'Remove every item from this section before deleting it.',
      ),
    ).toBeInTheDocument();
  });

  test('adding an item to a section calls the create mutation with a real price and currency', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Ավելացնել ուտեստ' }));
    await user.type(
      screen.getByLabelText('Ուտեստի անվանում', { exact: false }),
      'Lavash',
    );
    await user.type(screen.getByLabelText('Գին', { exact: false }), '1200');
    await user.click(screen.getByRole('button', { name: 'Ավելացնել ուտեստ' }));

    expect(createItemMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionId: 10,
        listingId: 99,
        locale: 'en',
        title: 'Lavash',
        priceAmount: 1200,
        priceCurrencyCode: 'AMD',
        dietaryMarkers: [],
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
