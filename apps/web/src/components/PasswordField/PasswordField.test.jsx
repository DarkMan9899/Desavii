import { useState } from 'react';
import { describe, test, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import PasswordField from './PasswordField.jsx';

function Harness() {
  const [value, setValue] = useState('');
  return (
    <PasswordField
      label="Password"
      autoComplete="new-password"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}

describe('PasswordField', () => {
  afterEach(async () => {
    await i18n.changeLanguage('hy');
  });

  test.each([
    ['hy', 'Ցույց տալ գաղտնաբառը', 'Թաքցնել գաղտնաբառը'],
    ['en', 'Show password', 'Hide password'],
    ['ru', 'Показать пароль', 'Скрыть пароль'],
  ])(
    '%s: the show/hide button is named in the current language and toggles the field',
    async (locale, show, hide) => {
      await i18n.changeLanguage(locale);
      const user = userEvent.setup();
      render(<Harness />);
      const input = screen.getByLabelText('Password');

      await user.type(input, 'Secret!2024');
      await user.click(screen.getByRole('button', { name: show }));
      expect(input).toHaveAttribute('type', 'text');
      expect(input).toHaveValue('Secret!2024');

      await user.click(screen.getByRole('button', { name: hide }));
      expect(input).toHaveAttribute('type', 'password');
    },
  );

  test('keeps the autocomplete hint password managers rely on', () => {
    render(<Harness />);

    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
  });
});
