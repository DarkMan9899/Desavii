import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import PropTypes from 'prop-types';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CurrencyContext from '../../../../contexts/CurrencyContext.jsx';
import { useSearchMapQuery } from '../../queries/useSearchMapQuery.js';
import SearchMapPanel from './SearchMapPanel.jsx';
import { SPLIT_LAYOUT_MEDIA_QUERY } from './mapConstants.js';
import hy from '../../../../../public/locales/hy/common.json';

vi.mock('../../queries/useSearchMapQuery.js', () => ({
  useSearchMapQuery: vi.fn(),
  default: vi.fn(),
}));

// Leaflet does not run in jsdom (the real map is covered end to end); this
// stand-in exposes what the panel hands the map and the map's callbacks.
const AREA = '44.40000,40.10000,44.60000,40.25000';
const GROUP_LABEL = 'open group';
const SEARCH_AREA_LABEL = 'search area';
const CLEAR_AREA_LABEL = 'clear area';
vi.mock('./SearchMap.jsx', () => {
  function StubMap({
    markers,
    fitKey,
    committedArea = undefined,
    onSelectListing,
    onSelectGroup,
    onSearchArea,
    onClearArea,
    children = null,
  }) {
    return (
      <div
        data-testid="map"
        data-markers={markers.length}
        data-fit={fitKey}
        data-area={committedArea ?? ''}
      >
        {markers.map((marker) => (
          <button
            key={marker.id}
            type="button"
            aria-label={`marker ${marker.title}`}
            onClick={() => onSelectListing(marker)}
          />
        ))}
        <button
          type="button"
          aria-label={GROUP_LABEL}
          onClick={() => onSelectGroup(markers)}
        />
        <button
          type="button"
          aria-label={SEARCH_AREA_LABEL}
          onClick={() => onSearchArea(AREA)}
        />
        <button
          type="button"
          aria-label={CLEAR_AREA_LABEL}
          onClick={onClearArea}
        />
        {children}
      </div>
    );
  }
  StubMap.propTypes = {
    // eslint-disable-next-line react/forbid-prop-types
    markers: PropTypes.array.isRequired,
    fitKey: PropTypes.string.isRequired,
    committedArea: PropTypes.string,
    onSelectListing: PropTypes.func.isRequired,
    onSelectGroup: PropTypes.func.isRequired,
    onSearchArea: PropTypes.func.isRequired,
    onClearArea: PropTypes.func.isRequired,
    children: PropTypes.node,
  };
  return { default: StubMap };
});

// The test harness's i18n instance defaults to Armenian (tests/setup.js).
const T = hy.search.map;
const CURRENCY = { currency: 'AMD', rates: { AMD: '1.00000000' } };

const marker = (id, title, extra = {}) => ({
  id,
  slug: `listing-${id}`,
  title,
  listing_type: 'HOTEL',
  category_slug: 'hotels',
  city_name: 'Երևան',
  latitude: 40.18,
  longitude: 44.51,
  location_precision: 'exact',
  price_amount: '20000.00',
  review_count: 0,
  ...extra,
});
const ARARAT = marker(1, 'Ararat Hotel');
const SEVAN = marker(2, 'Sevan Hotel');

function settled(markers, meta = {}) {
  return {
    data: {
      data: markers,
      meta: {
        total: markers.length,
        mappable: markers.length,
        returned: markers.length,
        truncated: false,
        ...meta,
      },
    },
    isPending: false,
    isError: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
  };
}

function Harness({ filters, onAreaChange }) {
  const [selectedId, setSelectedId] = useState(undefined);
  return (
    <SearchMapPanel
      filters={filters}
      isResolved
      selectedId={selectedId}
      onSelectedChange={setSelectedId}
      onAreaChange={onAreaChange}
    />
  );
}
Harness.propTypes = {
  filters: PropTypes.shape({ bbox: PropTypes.string }).isRequired,
  onAreaChange: PropTypes.func.isRequired,
};

function ui(filters, onAreaChange) {
  return (
    <CurrencyContext.Provider value={CURRENCY}>
      <MemoryRouter initialEntries={['/hy/search?view=map']}>
        <Routes>
          <Route
            path="/:locale/search"
            element={<Harness filters={filters} onAreaChange={onAreaChange} />}
          />
        </Routes>
      </MemoryRouter>
    </CurrencyContext.Provider>
  );
}

function renderPanel(filters = { view: 'map' }) {
  const onAreaChange = vi.fn();
  const view = render(ui(filters, onAreaChange));
  return {
    onAreaChange,
    rerender: (next = filters) => view.rerender(ui(next, onAreaChange)),
  };
}

function setSplitLayout(isSplit) {
  window.matchMedia = (query) => ({
    matches: isSplit && query === SPLIT_LAYOUT_MEDIA_QUERY,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
}

describe('SearchMapPanel (apps/web/src/modules/search)', () => {
  const originalMatchMedia = window.matchMedia;
  beforeEach(() => {
    setSplitLayout(true);
    useSearchMapQuery.mockReturnValue(settled([ARARAT, SEVAN]));
  });
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  test('loads the markers of the same search, and says so meanwhile', async () => {
    useSearchMapQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    });
    renderPanel({ view: 'map', categoryId: 1 });
    const map = await screen.findByTestId('map');
    expect(within(map).getByRole('status')).toHaveTextContent(T.loading);
    expect(useSearchMapQuery).toHaveBeenLastCalledWith(
      { view: 'map', categoryId: 1 },
      { locale: 'hy', enabled: true },
    );
  });

  test('a failed map offers a retry; the rest of Search is untouched', async () => {
    const refetch = vi.fn();
    useSearchMapQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      isPlaceholderData: false,
      refetch,
    });
    const user = userEvent.setup();
    renderPanel();
    expect(screen.getByText(T.error.title)).toBeInTheDocument();
    expect(screen.getByText(T.error.description)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: T.error.retry }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  test('markers of a previous search are never placed while the new ones load', async () => {
    useSearchMapQuery.mockReturnValue({
      ...settled([ARARAT, SEVAN]),
      isPlaceholderData: true,
    });
    const { rerender } = renderPanel({ view: 'map', categoryId: 2 });
    const map = await screen.findByTestId('map');
    expect(map).toHaveAttribute('data-markers', '0');
    expect(map).toHaveAttribute('data-fit', '');
    expect(within(map).getByRole('status')).toHaveTextContent(T.updating);

    useSearchMapQuery.mockReturnValue(settled([SEVAN]));
    rerender({ view: 'map', categoryId: 2 });
    expect(map).toHaveAttribute('data-markers', '1');
    expect(map.getAttribute('data-fit')).toContain('"categoryId":2');
    expect(within(map).getByRole('status')).toBeEmptyDOMElement();
  });

  test.each([
    [{ view: 'map' }, T.empty.title],
    [{ view: 'map', bbox: AREA }, T.emptyArea.title],
  ])('no results are explained (%o)', async (filters, title) => {
    useSearchMapQuery.mockReturnValue(settled([]));
    renderPanel(filters);
    expect(await screen.findByText(title)).toBeInTheDocument();
  });

  test('more results than the map shows, and results without a location, are stated', async () => {
    useSearchMapQuery.mockReturnValue(
      settled([ARARAT], { total: 620, mappable: 617, truncated: true }),
    );
    renderPanel();
    expect(await screen.findByText(T.truncated)).toBeInTheDocument();
    expect(
      screen.getByText(T.partial_other.replace('{{count}}', '3')),
    ).toBeInTheDocument();
  });

  test('"Search this area" commits the area; "Clear map area" removes it', async () => {
    const user = userEvent.setup();
    const { onAreaChange } = renderPanel({ view: 'map', bbox: AREA });
    expect(await screen.findByTestId('map')).toHaveAttribute('data-area', AREA);
    await user.click(screen.getByRole('button', { name: SEARCH_AREA_LABEL }));
    expect(onAreaChange).toHaveBeenLastCalledWith(AREA);
    await user.click(screen.getByRole('button', { name: CLEAR_AREA_LABEL }));
    expect(onAreaChange).toHaveBeenLastCalledWith(undefined);
  });

  describe('desktop preview card', () => {
    test('a marker opens its preview — focused, never a navigation', async () => {
      const user = userEvent.setup();
      renderPanel();
      await user.click(
        await screen.findByRole('button', { name: 'marker Ararat Hotel' }),
      );
      const heading = screen.getByRole('heading', { name: 'Ararat Hotel' });
      expect(heading).toHaveFocus();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: T.preview.learnMore }),
      ).toHaveAttribute('href', '/hy/listings/listing-1');
    });

    test('Escape and the close button close it, returning focus', async () => {
      const user = userEvent.setup();
      renderPanel();
      const opener = await screen.findByRole('button', {
        name: 'marker Ararat Hotel',
      });
      await user.click(opener);
      await user.keyboard('{Escape}');
      expect(
        screen.queryByRole('heading', { name: 'Ararat Hotel' }),
      ).toBeNull();
      expect(opener).toHaveFocus();

      await user.click(opener);
      await user.click(screen.getByRole('button', { name: T.preview.close }));
      expect(
        screen.queryByRole('heading', { name: 'Ararat Hotel' }),
      ).toBeNull();
    });

    test('listings at one point are listed, picked, and returned to', async () => {
      const user = userEvent.setup();
      renderPanel();
      await user.click(
        await screen.findByRole('button', { name: GROUP_LABEL }),
      );
      const group = screen.getByRole('region', { name: T.clusterList });
      expect(
        within(group).getByText(T.cluster_other.replace('{{count}}', '2')),
      ).toBeInTheDocument();
      await user.click(
        within(group).getByRole('button', { name: /Sevan Hotel/ }),
      );
      expect(
        screen.getByRole('heading', { name: 'Sevan Hotel' }),
      ).toHaveFocus();
      await user.click(screen.getByRole('button', { name: T.preview.back }));
      expect(
        screen.getByRole('heading', { name: T.clusterList }),
      ).toHaveFocus();
    });

    test('a selection the new results no longer contain is closed', async () => {
      const user = userEvent.setup();
      const { rerender } = renderPanel({ view: 'map', categoryId: 1 });
      await user.click(
        await screen.findByRole('button', { name: 'marker Ararat Hotel' }),
      );
      useSearchMapQuery.mockReturnValue(settled([SEVAN]));
      rerender({ view: 'map', categoryId: 3 });
      expect(
        screen.queryByRole('heading', { name: 'Ararat Hotel' }),
      ).toBeNull();
    });
  });

  test('on a phone the preview is a bottom sheet dialog', async () => {
    setSplitLayout(false);
    const user = userEvent.setup();
    renderPanel();
    await user.click(
      await screen.findByRole('button', { name: 'marker Ararat Hotel' }),
    );
    const sheet = screen.getByRole('dialog', { name: 'Ararat Hotel' });
    expect(
      within(sheet).getByRole('link', { name: T.preview.learnMore }),
    ).toBeInTheDocument();
    await user.click(
      within(sheet).getByRole('button', { name: T.preview.close }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
