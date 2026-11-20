import { describe, test, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Clock3 } from 'lucide-react';
import ListingFactGroupsSection from './ListingFactGroupsSection.jsx';

const row = (key, label, value) => ({ key, icon: Clock3, label, value });

describe('ListingFactGroupsSection', () => {
  test('renders nothing without groups — never an empty section', () => {
    const { container } = render(
      <ListingFactGroupsSection heading="Tour details" groups={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('one group: the section heading only, and the facts as a definition list', () => {
    render(
      <ListingFactGroupsSection
        heading="Meeting and pickup"
        sectionId="meeting"
        groups={[
          {
            key: 'meeting',
            heading: null,
            rows: [row('start', 'Start times', '09:00 and 14:00')],
          },
        ]}
      />,
    );
    const section = screen.getByRole('region', { name: 'Meeting and pickup' });
    expect(within(section).getByRole('heading', { level: 2 })).toHaveAttribute(
      'id',
      'meeting',
    );
    expect(within(section).queryByRole('heading', { level: 3 })).toBeNull();
    expect(within(section).getByRole('term')).toHaveTextContent('Start times');
    expect(within(section).getByRole('definition')).toHaveTextContent(
      '09:00 and 14:00',
    );
  });

  test('several groups: each under its own sub-heading', () => {
    render(
      <ListingFactGroupsSection
        heading="Vehicle specifications"
        groups={[
          { key: 'vehicle', heading: 'Car', rows: [row('a', 'Body', 'SUV')] },
          {
            key: 'drive',
            heading: 'Engine and drive',
            rows: [row('b', 'Drive', 'All-wheel drive')],
          },
        ]}
      />,
    );
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(['Car', 'Engine and drive']);
  });

  test('partner text renders as text, never as markup', () => {
    const { container } = render(
      <ListingFactGroupsSection
        heading="Meeting and pickup"
        groups={[
          {
            key: 'meeting',
            heading: null,
            rows: [row('p', 'Pickup details', '<img src=x onerror=alert(1)>')],
          },
        ]}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(
      screen.getByText('<img src=x onerror=alert(1)>'),
    ).toBeInTheDocument();
  });
});
