import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ListingLifecycleStatus from './ListingLifecycleStatus.jsx';

function listing(overrides = {}) {
  return {
    status: 'PUBLISHED',
    expires_at: null,
    frozen_at: null,
    purge_after: null,
    ...overrides,
  };
}

describe('ListingLifecycleStatus (apps/web/src/modules/listings)', () => {
  test('renders nothing for a legacy listing with no expires_at ever assigned', () => {
    const { container } = render(
      <ListingLifecycleStatus listing={listing()} locale="hy" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing for a manually-UNPUBLISHED (non-frozen) listing — never mislabels it as expired', () => {
    const { container } = render(
      <ListingLifecycleStatus
        listing={listing({
          status: 'UNPUBLISHED',
          expires_at: '2099-01-01T00:00:00.000Z',
        })}
        locale="hy"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // The test environment's active i18next language defaults to Armenian
  // regardless of the `locale` prop (which only ever drives
  // `Intl.DateTimeFormat`, never the translation language) — same
  // convention `ListingStatusBadge.test.jsx` already asserts against real
  // Armenian strings for, followed here too.
  test('shows the exact expiry date for an ACTIVE listing', () => {
    const farFuture = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    render(
      <ListingLifecycleStatus
        listing={listing({ expires_at: farFuture.toISOString() })}
        locale="hy"
      />,
    );
    expect(screen.getByText(/Ժամկետը լրանում է \d+ օրից/)).toBeInTheDocument();
    expect(screen.getByText(/-ին$/)).toBeInTheDocument();
  });

  test('shows an Expiring Soon label within the threshold', () => {
    // 1.5 days out: inside the 2-day threshold, but floors to 1 whole day
    // remaining, not 0 — the "Expiring Soon" branch, not "Expires today".
    const soon = new Date(Date.now() + 1.5 * 24 * 60 * 60 * 1000);
    render(
      <ListingLifecycleStatus
        listing={listing({ expires_at: soon.toISOString() })}
        locale="hy"
      />,
    );
    expect(screen.getByText(/Ժամկետը մոտենում է/)).toBeInTheDocument();
  });

  test('shows Expired / Frozen for a genuinely frozen listing, with no negative-day text', () => {
    render(
      <ListingLifecycleStatus
        listing={listing({
          status: 'UNPUBLISHED',
          expires_at: '2020-01-01T00:00:00.000Z',
          frozen_at: '2020-01-01T00:00:00.000Z',
          purge_after: '2020-07-01T00:00:00.000Z',
        })}
        locale="hy"
      />,
    );
    expect(screen.getByText('Ժամկետանց / Սառեցված')).toBeInTheDocument();
    expect(screen.queryByText(/-\d+ /)).not.toBeInTheDocument();
  });

  test('shows a "retained until" date for a frozen listing with a purge_after set', () => {
    render(
      <ListingLifecycleStatus
        listing={listing({
          status: 'UNPUBLISHED',
          expires_at: '2020-01-01T00:00:00.000Z',
          frozen_at: '2020-01-01T00:00:00.000Z',
          purge_after: '2020-07-01T00:00:00.000Z',
        })}
        locale="hy"
      />,
    );
    expect(screen.getByText(/Պահվում է մինչև/)).toBeInTheDocument();
  });
});
