import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ListingReviewsSection from './ListingReviewsSection.jsx';

vi.mock('../../../../reviews/index.js', () => ({
  // eslint-disable-next-line react/prop-types -- trivial test double
  ReviewsList: ({ listingId, companySlug }) => (
    <div>
      Reviews for {listingId} by {companySlug}
    </div>
  ),
}));

// The test harness's i18n is Armenian (tests/setup.js).
describe('ListingReviewsSection', () => {
  test('with no approved review: one honest line, no 0.0, no list request', () => {
    render(<ListingReviewsSection listingId={5} sectionId="reviews" />);
    expect(screen.getByRole('heading', { name: 'Կարծիքներ' })).toHaveAttribute(
      'id',
      'reviews',
    );
    expect(screen.queryByText(/0\.0/)).not.toBeInTheDocument();
    expect(screen.getByText(/^Կարծիքներ դեռ չկան/)).toBeInTheDocument();
    expect(screen.queryByText(/Reviews for/)).not.toBeInTheDocument();
  });

  test('one summary — the real average and approved count, spoken once — then the reviews', () => {
    render(
      <ListingReviewsSection
        listingId={5}
        companySlug="ararat-stays"
        rating={{ average: 4.2, count: 9 }}
      />,
    );
    expect(screen.getAllByText('4,2')).toHaveLength(1);
    expect(screen.getByText('9 կարծիք')).toBeInTheDocument();
    expect(
      screen.getByText('Գնահատականը՝ 4,2 5-ից, 9 կարծիք'),
    ).toBeInTheDocument();
    // The company slug (never an internal partner id) reaches the list.
    expect(
      screen.getByText('Reviews for 5 by ararat-stays'),
    ).toBeInTheDocument();
  });
});
