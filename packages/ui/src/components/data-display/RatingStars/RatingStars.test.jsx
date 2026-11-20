import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RatingStars from './RatingStars.jsx';

describe('RatingStars', () => {
  test('one image with one accessible name — never five unlabeled stars', () => {
    render(<RatingStars value={4.5} reviewCount={12} />);
    expect(
      screen.getByRole('img', { name: '4.5 out of 5 stars, 12 reviews' }),
    ).toBeInTheDocument();
  });

  test('the caller’s localized name and the locale’s decimal comma', () => {
    render(
      <RatingStars
        value={4.46}
        reviewCount={3}
        locale="hy"
        label="Գնահատականը՝ 4,5 5-ից, 3 կարծիք"
      />,
    );
    expect(
      screen.getByRole('img', { name: 'Գնահատականը՝ 4,5 5-ից, 3 կարծիք' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/4,5/)).toBeInTheDocument();
  });

  test('a value outside 0..5 is clamped', () => {
    render(<RatingStars value={7} />);
    expect(
      screen.getByRole('img', { name: '5.0 out of 5 stars' }),
    ).toBeInTheDocument();
  });
});
