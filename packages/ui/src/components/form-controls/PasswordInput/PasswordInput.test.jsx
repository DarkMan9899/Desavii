import { forwardRef, useState } from 'react';
import PropTypes from 'prop-types';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PasswordInput from './PasswordInput.jsx';

// `forwardRef`-wrapped so a test can pass a ref through to PasswordInput,
// as React Hook Form's `Controller` does.
const ControlledPassword = forwardRef(function ControlledPassword(
  { label, initialValue = '', ...rest },
  ref,
) {
  const [value, setValue] = useState(initialValue);
  return (
    <PasswordInput
      ref={ref}
      label={label}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      // eslint-disable-next-line react/jsx-props-no-spreading -- test helper forwards PasswordInput props
      {...rest}
    />
  );
});
/* eslint-disable react/require-default-props -- inline defaults above */
ControlledPassword.propTypes = {
  label: PropTypes.string.isRequired,
  initialValue: PropTypes.string,
};
/* eslint-enable react/require-default-props */

describe('PasswordInput', () => {
  test('is hidden by default, and the eye button shows then hides the same value', async () => {
    const user = userEvent.setup();
    render(<ControlledPassword label="Password" initialValue="Secret!2024" />);
    const input = screen.getByLabelText('Password');

    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveValue('Secret!2024');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveValue('Secret!2024');
  });

  test('keeps the same input element, its autocomplete hint, and the forwarded ref across toggles', async () => {
    const user = userEvent.setup();
    const ref = { current: null };
    render(
      <ControlledPassword
        label="Password"
        autoComplete="current-password"
        ref={ref}
      />,
    );
    const input = screen.getByLabelText('Password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));

    expect(screen.getByLabelText('Password')).toBe(input);
    expect(input).toHaveAttribute('autocomplete', 'current-password');
    expect(ref.current).toBe(input);
  });

  test('a pointer press keeps focus and the caret in the field, so typing continues', async () => {
    const user = userEvent.setup();
    render(<ControlledPassword label="Password" />);
    const input = screen.getByLabelText('Password');

    await user.type(input, 'abcdef');
    input.setSelectionRange(2, 2);
    await user.click(screen.getByRole('button', { name: 'Show password' }));

    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(2);
    await user.keyboard('X');
    expect(input).toHaveValue('abXcdef');
  });

  test('the toggle never submits its form', async () => {
    const onSubmit = vi.fn((event) => event.preventDefault());
    const user = userEvent.setup();
    render(
      <form onSubmit={onSubmit}>
        <ControlledPassword label="Password" />
      </form>,
    );

    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('type', 'button');
    await user.click(toggle);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('is reachable by Tab right after the field and toggles with Enter and Space', async () => {
    const user = userEvent.setup();
    render(<ControlledPassword label="Password" />);
    const input = screen.getByLabelText('Password');

    await user.click(input);
    await user.tab();
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveFocus();
    await user.keyboard(' ');
    expect(input).toHaveAttribute('type', 'password');
  });

  test('uses the translated labels it is given', async () => {
    const user = userEvent.setup();
    render(
      <ControlledPassword
        label="Գաղտնաբառ"
        showLabel="Ցույց տալ գաղտնաբառը"
        hideLabel="Թաքցնել գաղտնաբառը"
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Ցույց տալ գաղտնաբառը' }),
    );
    expect(
      screen.getByRole('button', { name: 'Թաքցնել գաղտնաբառը' }),
    ).toBeInTheDocument();
  });

  test('a password and its confirmation are revealed independently', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ControlledPassword label="New password" />
        <ControlledPassword label="Confirm password" />
      </>,
    );
    const [showNew] = screen.getAllByRole('button', { name: 'Show password' });

    await user.click(showNew);

    expect(screen.getByLabelText('New password')).toHaveAttribute(
      'type',
      'text',
    );
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute(
      'type',
      'password',
    );
  });

  test('a disabled field disables its toggle too', () => {
    render(<ControlledPassword label="Password" disabled />);

    expect(
      screen.getByRole('button', { name: 'Show password' }),
    ).toBeDisabled();
  });
});
