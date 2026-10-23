import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Clock } from 'lucide-react';
import PolicyList from './PolicyList.jsx';

describe('PolicyList', () => {
  test('renders one row per policy: title and short value, icon hidden from assistive technology', () => {
    const { container } = render(
      <PolicyList
        policies={[
          { icon: Clock, title: 'Check-in', description: '14:00' },
          { title: 'Pets', description: 'Not allowed' },
        ]}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Check-in')).toBeInTheDocument();
    expect(screen.getByText('14:00')).toBeInTheDocument();
    expect(screen.getByText('Not allowed')).toBeInTheDocument();
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(
      1,
    );
    expect(container.querySelector('details')).not.toBeInTheDocument();
  });

  // The summary is the native disclosure button (keyboard-operable in a
  // browser; jsdom does not model its focusability, so this activates it).
  test('a policy with details opens its explanation from its summary', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <PolicyList
        policies={[
          {
            title: 'Cancellation',
            description: 'Flexible',
            details: 'Refund requests are reviewed individually.',
          },
        ]}
      />,
    );
    const details = container.querySelector('details');
    expect(details).not.toHaveAttribute('open');

    await user.click(container.querySelector('summary'));
    expect(details).toHaveAttribute('open');
    expect(
      screen.getByText('Refund requests are reviewed individually.'),
    ).toBeVisible();
  });
});
