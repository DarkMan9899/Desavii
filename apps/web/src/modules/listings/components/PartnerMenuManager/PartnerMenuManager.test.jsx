import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmProvider from '../../../../providers/ConfirmProvider.jsx';
import PartnerMenuManager from './PartnerMenuManager.jsx';
import { useListingMenuQuery } from '../../queries/useListingMenuQuery.js';
import { useCreateListingMenuMutation } from '../../mutations/useCreateListingMenuMutation.js';
import { useUpdateListingMenuMutation } from '../../mutations/useUpdateListingMenuMutation.js';
import { useDeleteListingMenuMutation } from '../../mutations/useDeleteListingMenuMutation.js';

vi.mock('../../queries/useListingMenuQuery.js', () => ({
  useListingMenuQuery: vi.fn(),
}));
vi.mock('../../mutations/useCreateListingMenuMutation.js', () => ({
  useCreateListingMenuMutation: vi.fn(),
}));
vi.mock('../../mutations/useUpdateListingMenuMutation.js', () => ({
  useUpdateListingMenuMutation: vi.fn(),
}));
vi.mock('../../mutations/useDeleteListingMenuMutation.js', () => ({
  useDeleteListingMenuMutation: vi.fn(),
}));
// MenuPanel (rendered for every real menu) owns its own section/item
// mutations — inert here since these tests exercise the menu level only;
// MenuPanel's own behavior has its own dedicated test file.
vi.mock('../../mutations/useCreateListingMenuSectionMutation.js', () => ({
  useCreateListingMenuSectionMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  }),
}));
vi.mock('../../mutations/useUpdateListingMenuSectionMutation.js', () => ({
  useUpdateListingMenuSectionMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  }),
}));
vi.mock('../../mutations/useDeleteListingMenuSectionMutation.js', () => ({
  useDeleteListingMenuSectionMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
    variables: undefined,
  }),
}));
vi.mock('../../mutations/useCreateListingMenuItemMutation.js', () => ({
  useCreateListingMenuItemMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  }),
}));
vi.mock('../../mutations/useUpdateListingMenuItemMutation.js', () => ({
  useUpdateListingMenuItemMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  }),
}));
vi.mock('../../mutations/useDeleteListingMenuItemMutation.js', () => ({
  useDeleteListingMenuItemMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
    variables: undefined,
  }),
}));

const EN_MENU = {
  id: 5,
  name: 'Dinner Menu',
  description: null,
  is_active: true,
  sections: [],
};

function mockMenusByLocale(byLocale) {
  useListingMenuQuery.mockImplementation((_listingId, locale) => ({
    data: byLocale[locale] ?? [],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }));
}

function renderManager(defaultLocale = 'en') {
  return render(
    <ConfirmProvider>
      <PartnerMenuManager listingId={99} defaultLocale={defaultLocale} />
    </ConfirmProvider>,
  );
}

describe('PartnerMenuManager (Pass 6, Restaurant vertical, owner issue #13)', () => {
  let createMenuMutate;

  beforeEach(() => {
    createMenuMutate = vi.fn();
    useCreateListingMenuMutation.mockReturnValue({
      mutate: createMenuMutate,
      isPending: false,
      error: null,
    });
    useUpdateListingMenuMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      error: null,
    });
    useDeleteListingMenuMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      error: null,
      variables: undefined,
    });
  });

  test('an unauthored language shows the honest "no menus yet" empty state, never a fabricated menu', () => {
    mockMenusByLocale({ en: [], hy: [], ru: [] });
    renderManager('en');

    expect(
      screen.getByText('Մենյու դեռ չկա։ Ավելացրեք մեկը՝ սկսելու համար։'),
    ).toBeInTheDocument();
  });

  test('the locale tab completion signal is real: only a language with an actual menu gets a checkmark', () => {
    mockMenusByLocale({ en: [EN_MENU], hy: [], ru: [] });
    renderManager('en');

    expect(screen.getByRole('tab', { name: /English ✓/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Հայերեն ·/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Русский ·/ })).toBeInTheDocument();
  });

  test('adding a menu with a chosen language calls the create mutation with that languageCode', async () => {
    const user = userEvent.setup();
    mockMenusByLocale({ en: [], hy: [], ru: [] });
    renderManager('en');

    await user.click(screen.getByRole('button', { name: 'Ավելացնել մենյու' }));
    await user.type(
      screen.getByLabelText('Մենյուի անվանում', { exact: false }),
      'Lunch Menu',
    );
    await user.click(screen.getByRole('button', { name: 'Ավելացնել մենյու' }));

    expect(createMenuMutate).toHaveBeenCalledWith(
      {
        listingId: 99,
        locale: 'en',
        languageCode: 'en',
        name: 'Lunch Menu',
        description: undefined,
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  test('an existing menu renders its real name/description and delegates sections/items to MenuPanel', () => {
    mockMenusByLocale({
      en: [{ ...EN_MENU, description: 'Served 6pm-11pm' }],
      hy: [],
      ru: [],
    });
    renderManager('en');

    expect(screen.getByText('Dinner Menu')).toBeInTheDocument();
    expect(screen.getByText('Served 6pm-11pm')).toBeInTheDocument();
    // MenuPanel's own "Sections" heading proves it actually rendered.
    expect(screen.getByText('Բաժիններ')).toBeInTheDocument();
  });
});
