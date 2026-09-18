/**
 * Step A3 — analytics wiring on `SearchResultCard`, the shared
 * instrumentation boundary for every public listing-card surface (brief
 * §17/§34). The base rendering behavior (links, badges, favorite button)
 * already has its own coverage in `SearchResultCard.test.jsx` — this
 * file is scoped to the impression/click tracking this step adds.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import PropTypes from 'prop-types';
import SearchResultCard from './SearchResultCard.jsx';
import CurrencyProvider from '../../../../providers/CurrencyProvider.jsx';
import {
  resetQueueForTests,
  peekQueueForTests,
} from '../../../../analytics/analyticsQueue.js';
import { resetDedupForTests } from '../../../../analytics/analyticsClient.js';
import { resetInMemoryIdentityForTests } from '../../../../analytics/analyticsIdentity.js';

vi.mock(
  '../../../favorites/components/FavoriteButton/FavoriteButton.jsx',
  () => ({ default: () => null }),
);
vi.mock('../../../../api/fx.js', () => ({
  getRates: vi.fn().mockResolvedValue({
    success: true,
    data: {
      baseCurrency: 'AMD',
      rates: { AMD: '1.00000000' },
      effectiveAt: '2026-01-01',
      source: 'fixture',
    },
    meta: null,
    error: null,
  }),
}));

const RESULT = {
  id: 7,
  listing_type: 'HOTEL',
  title: 'Yerevan Grand Hotel',
  summary: 'A central hotel with mountain views.',
  city_name: 'Yerevan',
  cover_image_url: 'https://example.test/cover.jpg',
  media_count: 1,
  price_amount: null,
  price_currency_code: null,
  category_slug: 'hotels',
};

function Harness({ cardProps }) {
  const { locale } = useParams();
  return (
    <CurrencyProvider locale={locale}>
      {/* eslint-disable-next-line react/jsx-props-no-spreading -- test-only pass-through of SearchResultCard's own already-typed props */}
      <SearchResultCard result={RESULT} {...cardProps} />
    </CurrencyProvider>
  );
}
Harness.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types -- test-only pass-through of SearchResultCard's own already-typed props
  cardProps: PropTypes.object.isRequired,
};

function renderCard(cardProps) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/en/search']}>
        <Routes>
          <Route
            path="/:locale/search"
            element={<Harness cardProps={cardProps} />}
          />
          <Route path="/:locale/listings/:id" element={null} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function installControllableObserver() {
  let capturedCallback;
  function MockIntersectionObserver(callback) {
    capturedCallback = callback;
    return { observe: () => {}, unobserve: () => {}, disconnect: () => {} };
  }
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  return {
    fireVisible: () =>
      capturedCallback([{ isIntersecting: true, intersectionRatio: 1 }]),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('VITE_ANALYTICS_COLLECTION_ENABLED', 'true');
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetInMemoryIdentityForTests();
  resetQueueForTests();
  resetDedupForTests();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetQueueForTests();
});

describe('SearchResultCard — impression tracking', () => {
  test('fires listing_impression with listingId/placement/position once visible for 1000ms', () => {
    const { fireVisible } = installControllableObserver();
    renderCard({ placement: 'search_results', position: 3 });

    fireVisible();
    vi.advanceTimersByTime(1000);

    const events = peekQueueForTests();
    const impression = events.find((e) => e.eventName === 'listing_impression');
    expect(impression).toMatchObject({
      listingId: 7,
      placement: 'search_results',
      position: 3,
      categoryCode: 'hotels',
    });
  });

  test('never observes at all when no placement is given (e.g. Favorites-style usage)', () => {
    const observeSpy = vi.fn();
    function MockIntersectionObserver() {
      return { observe: observeSpy, unobserve: () => {}, disconnect: () => {} };
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    renderCard({});

    expect(observeSpy).not.toHaveBeenCalled();
    expect(peekQueueForTests()).toHaveLength(0);
  });

  test('also fires promotion_impression when a promotionId is supplied', () => {
    const { fireVisible } = installControllableObserver();
    renderCard({ placement: 'home_featured', promotionId: 42 });

    fireVisible();
    vi.advanceTimersByTime(1000);

    const events = peekQueueForTests();
    expect(
      events.find((e) => e.eventName === 'listing_impression'),
    ).toBeTruthy();
    const promo = events.find((e) => e.eventName === 'promotion_impression');
    expect(promo).toMatchObject({
      promotionId: 42,
      listingId: 7,
      placement: 'home_featured',
    });
  });

  test('an organic (non-promoted) card never fires promotion_impression', () => {
    const { fireVisible } = installControllableObserver();
    renderCard({ placement: 'home_featured' });

    fireVisible();
    vi.advanceTimersByTime(1000);

    expect(
      peekQueueForTests().find((e) => e.eventName === 'promotion_impression'),
    ).toBeUndefined();
  });
});

describe('SearchResultCard — click tracking', () => {
  test('clicking a search_results-placement card fires search_result_click with listingId/position', () => {
    installControllableObserver();
    renderCard({
      placement: 'search_results',
      position: 2,
      searchContext: { queryText: 'yerevan', categoryCode: 'hotels' },
    });

    fireEvent.click(document.querySelector('a[href*="/en/listings/"]'));

    const click = peekQueueForTests().find(
      (e) => e.eventName === 'search_result_click',
    );
    expect(click).toMatchObject({
      listingId: 7,
      position: 2,
      queryText: 'yerevan',
      categoryCode: 'hotels',
    });
  });

  test('clicking a card with a companySlug fires company_listing_click, not search_result_click', () => {
    installControllableObserver();
    renderCard({ placement: 'search_results', companySlug: 'acme-hotels' });

    fireEvent.click(document.querySelector('a[href*="/en/listings/"]'));

    const events = peekQueueForTests();
    expect(
      events.find((e) => e.eventName === 'company_listing_click'),
    ).toMatchObject({ companySlug: 'acme-hotels', listingId: 7 });
    expect(
      events.find((e) => e.eventName === 'search_result_click'),
    ).toBeUndefined();
  });

  test('clicking a promoted card also fires promotion_clicked', () => {
    installControllableObserver();
    renderCard({ placement: 'category_top', promotionId: 9 });

    fireEvent.click(document.querySelector('a[href*="/en/listings/"]'));

    const click = peekQueueForTests().find(
      (e) => e.eventName === 'promotion_clicked',
    );
    expect(click).toMatchObject({
      promotionId: 9,
      listingId: 7,
      placement: 'category_top',
    });
  });

  test('never sends partner_id in any event payload', () => {
    installControllableObserver();
    renderCard({ placement: 'search_results', promotionId: 9 });
    fireEvent.click(document.querySelector('a[href*="/en/listings/"]'));

    peekQueueForTests().forEach((event) => {
      expect(event).not.toHaveProperty('partnerId');
      expect(event).not.toHaveProperty('partner_id');
    });
  });
});
