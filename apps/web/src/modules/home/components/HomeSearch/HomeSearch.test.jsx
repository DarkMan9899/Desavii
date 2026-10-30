import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import HomeSearch from './HomeSearch.jsx';
import useMediaQuery from '../../../../hooks/useMediaQuery.js';
import { useAuth } from '../../../../contexts/AuthContext.jsx';
import {
  useCategoriesQuery,
  useDestinationsQuery,
  useSearchFilterDefinitionsQuery,
} from '../../../search/index.js';
import {
  useAiSearchAvailabilityQuery,
  useParseSearchQueryMutation,
} from '../../../ai/index.js';

vi.mock('../../../search/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useCategoriesQuery: vi.fn(),
  useDestinationsQuery: vi.fn(),
  useSearchFilterDefinitionsQuery: vi.fn(),
}));
vi.mock('../../../ai/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useAiSearchAvailabilityQuery: vi.fn(),
  useParseSearchQueryMutation: vi.fn(),
}));
vi.mock('../../../../contexts/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../../../../hooks/useMediaQuery.js', () => ({ default: vi.fn() }));

const PARSED = {
  keyword: 'quiet stay',
  category_id: 1,
  category_name: 'Hotels',
  city_id: 11,
  city_name: 'Dilijan',
  amenity_ids: [],
};

function SearchPage() {
  const location = useLocation();
  return <p data-testid="search-page">{location.search}</p>;
}

function renderSearch(entry = '/en') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/:locale" element={<HomeSearch />} />
        <Route path="/:locale/search" element={<SearchPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('HomeSearch (apps/web/src/modules/home)', () => {
  let mutation;

  beforeEach(() => {
    useCategoriesQuery.mockReturnValue({
      data: [{ id: 1, slug: 'hotels', name: 'Hotels' }],
    });
    useDestinationsQuery.mockReturnValue({ data: [] });
    useSearchFilterDefinitionsQuery.mockReturnValue({ data: [] });
    useAuth.mockReturnValue({ isAuthenticated: true });
    useAiSearchAvailabilityQuery.mockReturnValue({
      isPending: false,
      data: true,
    });
    mutation = {
      mutate: vi.fn((variables, { onSuccess }) => onSuccess({ data: PARSED })),
      reset: vi.fn(),
      isPending: false,
      isError: false,
    };
    useParseSearchQueryMutation.mockReturnValue(mutation);
  });

  describe('from tablet up', () => {
    beforeEach(() => useMediaQuery.mockReturnValue(true));

    test('every field is visible at once in a labelled search landmark', () => {
      renderSearch();
      const form = screen.getByRole('search', { name: 'Որոնել Հայաստանում' });
      expect(form).toContainElement(
        screen.getByRole('textbox', { name: 'Բանալի բառ' }),
      );
    });

    test('Search opens the Search page with what was typed', async () => {
      const user = userEvent.setup();
      renderSearch();
      await user.type(
        screen.getByRole('textbox', { name: 'Բանալի բառ' }),
        'Garni',
      );
      await user.click(screen.getByRole('button', { name: 'Որոնել' }));
      expect(screen.getByTestId('search-page')).toHaveTextContent(
        '?destination=Garni',
      );
    });

    test('Search and Ask Desavii are two tabs of one panel, keyboard-operable', async () => {
      const user = userEvent.setup();
      renderSearch();
      const tabs = screen.getAllByRole('tab');
      expect(tabs.map((tab) => tab.textContent)).toEqual([
        'Որոնում',
        'Հարցրեք Desavii-ին',
      ]);
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

      tabs[0].focus();
      await user.keyboard('{ArrowRight}');
      expect(screen.getAllByRole('tab')[1]).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getAllByRole('tab')[1]).toHaveFocus();
      expect(screen.getByRole('tabpanel')).toContainElement(
        screen.getByRole('textbox', {
          name: 'Նկարագրեք ձեր ուզած ճամփորդությունը',
        }),
      );
    });

    test('while no real model answers, Ask Desavii says so and offers Search — it never pretends', async () => {
      useAiSearchAvailabilityQuery.mockReturnValue({
        isPending: false,
        data: false,
      });
      const user = userEvent.setup();
      renderSearch();
      await user.click(screen.getByRole('tab', { name: /Desavii/ }));

      expect(
        screen.getByRole('textbox', {
          name: 'Նկարագրեք ձեր ուզած ճամփորդությունը',
        }),
      ).toBeDisabled();
      expect(screen.getByRole('status')).toHaveTextContent(
        'Հարցրեք Desavii-ին գործառույթը դեռ հասանելի չէ',
      );
      await user.click(screen.getByRole('button', { name: 'Անցնել որոնման' }));
      expect(screen.getByRole('search')).toBeInTheDocument();
    });

    test('a request becomes checked, editable intent; Show results opens /search with real ids only', async () => {
      const user = userEvent.setup();
      renderSearch();
      await user.click(screen.getByRole('tab', { name: /Desavii/ }));
      await user.type(
        screen.getByRole('textbox', {
          name: 'Նկարագրեք ձեր ուզած ճամփորդությունը',
        }),
        'A quiet stay in Dilijan for two',
      );
      await user.click(
        screen.getByRole('button', { name: 'Հարցնել Desavii-ին' }),
      );

      // Nothing opens by itself: the interpretation is shown first.
      expect(screen.queryByTestId('search-page')).not.toBeInTheDocument();
      const understood = screen.getByRole('region', {
        name: 'Desavii-ն հասկացավ',
      });
      expect(within(understood).getByText('Dilijan')).toBeInTheDocument();
      expect(within(understood).getByText('Hotels')).toBeInTheDocument();

      await user.click(
        screen.getByRole('button', { name: 'Հեռացնել՝ quiet stay' }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Ցույց տալ արդյունքները' }),
      );
      expect(screen.getByTestId('search-page')).toHaveTextContent(
        '?categoryId=1&cityId=11',
      );
    });

    test('Refine in Search puts the interpretation into the fields', async () => {
      const user = userEvent.setup();
      renderSearch();
      await user.click(screen.getByRole('tab', { name: /Desavii/ }));
      await user.type(screen.getByRole('textbox'), 'quiet stay in Dilijan');
      await user.click(
        screen.getByRole('button', { name: 'Հարցնել Desavii-ին' }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Ճշգրտել որոնման մեջ' }),
      );
      expect(screen.getByRole('textbox', { name: 'Բանալի բառ' })).toHaveValue(
        'quiet stay',
      );
    });

    test('when AI fails, the words are kept and Search is one click away', async () => {
      mutation.isError = true;
      mutation.mutate = vi.fn();
      const user = userEvent.setup();
      renderSearch();
      await user.click(screen.getByRole('tab', { name: /Desavii/ }));
      await user.type(screen.getByRole('textbox'), 'Gyumri with kids');
      expect(screen.getByRole('alert')).toBeInTheDocument();
      await user.click(
        screen.getByRole('button', { name: 'Որոնել այս բառերով' }),
      );
      expect(screen.getByRole('textbox', { name: 'Բանալի բառ' })).toHaveValue(
        'Gyumri with kids',
      );
    });

    test('a guest is sent to log in and brought back to Ask Desavii', async () => {
      useAuth.mockReturnValue({ isAuthenticated: false });
      const user = userEvent.setup();
      renderSearch();
      await user.click(screen.getByRole('tab', { name: /Desavii/ }));
      expect(
        screen.getByRole('link', { name: 'Մուտք գործել և հարցնել' }),
      ).toHaveAttribute('href', '/en/auth/login?redirect=%2Fen%3Fask%3D1');
    });

    test('coming back with ?ask=1 opens Ask Desavii', () => {
      renderSearch('/en?ask=1');
      expect(screen.getByRole('tab', { name: /Desavii/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
  });

  describe('on a phone', () => {
    beforeEach(() => useMediaQuery.mockReturnValue(false));

    test('one field-like button summarises the search and opens it as a dialog', async () => {
      const user = userEvent.setup();
      renderSearch();
      const trigger = screen.getByRole('button', {
        name: /Ո՞ւր եք գնում Հայաստանում/,
      });
      expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
      expect(screen.queryByRole('search')).not.toBeInTheDocument();

      await user.click(trigger);
      const dialog = screen.getByRole('dialog', { name: 'Որոնել Հայաստանում' });
      expect(dialog).toContainElement(
        screen.getByRole('search', { name: 'Որոնել Հայաստանում' }),
      );
    });

    test('the sheet’s Search button submits the same search', async () => {
      const user = userEvent.setup();
      renderSearch();
      await user.click(
        screen.getByRole('button', { name: /Ո՞ւր եք գնում Հայաստանում/ }),
      );
      await user.type(
        screen.getByRole('textbox', { name: 'Բանալի բառ' }),
        'Dilijan',
      );
      await user.click(screen.getByRole('button', { name: 'Որոնել' }));
      expect(screen.getByTestId('search-page')).toHaveTextContent(
        '?destination=Dilijan',
      );
    });

    test('a second button opens the sheet straight in Ask Desavii', async () => {
      const user = userEvent.setup();
      renderSearch();
      await user.click(
        screen.getByRole('button', { name: 'Հարցրեք Desavii-ին ձեր բառերով' }),
      );
      expect(
        within(screen.getByRole('dialog')).getByRole('tab', {
          name: /Desavii/,
        }),
      ).toHaveAttribute('aria-selected', 'true');
    });
  });
});
