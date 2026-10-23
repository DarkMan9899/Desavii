import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Button from './Button.jsx';

describe('Button (COMPONENT_LIBRARY.md Part II §1)', () => {
  test('renders as a native button with its label', () => {
    render(<Button>Book now</Button>);
    expect(
      screen.getByRole('button', { name: 'Book now' }),
    ).toBeInTheDocument();
  });

  test('fires onClick when clicked', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Confirm</Button>);

    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('activates on Enter and Space via native button semantics', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Search</Button>);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Search' })).toHaveFocus();

    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  test('disabled button is not focusable and never fires onClick', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button onClick={onClick} disabled>
        Sold out
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Sold out' });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  test('loading state sets aria-busy, disables the button, and keeps it in the tree', () => {
    render(<Button loading>Pay now</Button>);

    const button = screen.getByRole('button', { name: 'Pay now' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
  });

  test('supports every documented variant without throwing', () => {
    ['primary', 'secondary', 'ghost', 'destructive'].forEach((variant) => {
      const { unmount } = render(<Button variant={variant}>Action</Button>);
      expect(
        screen.getByRole('button', { name: 'Action' }),
      ).toBeInTheDocument();
      unmount();
    });
  });

  test('supports every documented size without throwing', () => {
    ['sm', 'md', 'lg'].forEach((size) => {
      const { unmount } = render(<Button size={size}>Action</Button>);
      expect(
        screen.getByRole('button', { name: 'Action' }),
      ).toBeInTheDocument();
      unmount();
    });
  });

  test('icon-only usage is still accessible via an explicit aria-label', () => {
    render(
      <Button
        ariaLabel="Add to favorites"
        iconLeft={<svg aria-hidden="true" />}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Add to favorites' }),
    ).toBeInTheDocument();
  });

  test('defaults to type="button" so it never accidentally submits a form', () => {
    render(<Button>Cancel</Button>);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute(
      'type',
      'button',
    );
  });

  test('type="submit" is honored for form-submitting usages', () => {
    render(<Button type="submit">Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute(
      'type',
      'submit',
    );
  });

  test('announces the popup it opens only when asked to', () => {
    render(
      <>
        <Button ariaHasPopup="dialog">Show all</Button>
        <Button>Save</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Show all' })).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
    expect(screen.getByRole('button', { name: 'Save' })).not.toHaveAttribute(
      'aria-haspopup',
    );
  });
});
