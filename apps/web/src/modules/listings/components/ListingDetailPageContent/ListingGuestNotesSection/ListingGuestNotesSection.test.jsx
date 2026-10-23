import { describe, test, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import ListingGuestNotesSection from './ListingGuestNotesSection.jsx';

describe('ListingGuestNotesSection', () => {
  test('renders nothing when the partner wrote no notes', () => {
    const { container } = render(<ListingGuestNotesSection notes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('one list per kind present, in a fixed order, each under its own heading', () => {
    render(
      <ListingGuestNotesSection
        sectionId="guestNotes"
        notes={[
          { id: 3, kind: 'KNOW_BEFORE', text: 'Covered shoulders' },
          { id: 1, kind: 'BRING', text: 'Water' },
          { id: 2, kind: 'BRING', text: 'Passport' },
        ]}
      />,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Օգտակար է իմանալ' }),
    ).toHaveAttribute('id', 'guestNotes');
    const groupHeadings = screen.getAllByRole('heading', { level: 3 });
    expect(groupHeadings.map((heading) => heading.textContent)).toEqual([
      'Ինչ վերցնել',
      'Ինչ իմանալ նախապես',
    ]);
    // A kind with no notes ("Not allowed") gets no empty heading.
    expect(screen.queryByText('Արգելված է')).not.toBeInTheDocument();

    const [bringList] = screen.getAllByRole('list');
    expect(
      within(bringList)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Water', 'Passport']);
  });
});
