import { describe, test, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Clock3, Users2 } from 'lucide-react';
import ListingKeyFacts from './ListingKeyFacts.jsx';

describe('ListingKeyFacts', () => {
  test('renders nothing without facts', () => {
    const { container } = render(<ListingKeyFacts facts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('is a labelled region of label/value pairs, under a heading only assistive technology needs', () => {
    render(
      <ListingKeyFacts
        facts={[
          {
            key: 'duration_minutes',
            icon: Clock3,
            label: 'Duration',
            value: '3h',
          },
          {
            key: 'group_size',
            icon: Users2,
            label: 'Group size',
            value: '2–12 people',
          },
        ]}
      />,
    );
    const region = screen.getByRole('region', { name: 'Հիմնական փաստեր' });
    expect(
      within(region).getByRole('heading', { level: 2 }),
    ).toBeInTheDocument();
    const terms = within(region).getAllByRole('term');
    const definitions = within(region).getAllByRole('definition');
    expect(terms.map((term) => term.textContent)).toEqual([
      'Duration',
      'Group size',
    ]);
    expect(definitions.map((definition) => definition.textContent)).toEqual([
      '3h',
      '2–12 people',
    ]);
  });
});
