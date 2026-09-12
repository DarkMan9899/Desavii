import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import DestinationArt, { seedToIndex } from './DestinationArt.jsx';

describe('DestinationArt', () => {
  test('backward compatibility: with no motif/meshVariant override, the seed hash alone still determines both (Pass 7B must not change existing callers)', () => {
    const index = seedToIndex('about');
    const { container } = render(<DestinationArt seed="about" />);
    expect(container.firstChild.className).toContain(
      `art--mesh-${(index % 5) + 1}`,
    );
  });

  test('an explicit motif/meshVariant override wins over the seed hash (Pass 7B category hero curation)', () => {
    const { container } = render(
      <DestinationArt seed={1} motif="ticket" meshVariant={5} />,
    );
    expect(container.firstChild.className).toContain('art--mesh-5');
    // The 'ticket' motif renders a <rect> with the perforated-divider
    // dashed line — a cheap, specific-enough signal that the override
    // motif (not the seed-hash 'peaks', what seed=1 would hash to) rendered.
    expect(container.querySelector('rect')).not.toBeNull();
  });

  test('renders as purely decorative (aria-hidden)', () => {
    const { container } = render(<DestinationArt seed="x" />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});
