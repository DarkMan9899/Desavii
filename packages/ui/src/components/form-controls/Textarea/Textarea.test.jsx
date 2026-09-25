import { useState } from 'react';
import PropTypes from 'prop-types';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Textarea from './Textarea.jsx';

function ControlledTextarea({ initialValue = '', ...rest }) {
  const [value, setValue] = useState(initialValue);
  return (
    <Textarea
      // eslint-disable-next-line react/jsx-props-no-spreading -- test helper forwards arbitrary Textarea props
      {...rest}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

ControlledTextarea.propTypes = {
  initialValue: PropTypes.string,
};

describe('Textarea (COMPONENT_LIBRARY.md Part II §2)', () => {
  test('label is programmatically associated via htmlFor/id', () => {
    render(<ControlledTextarea label="Description" />);
    expect(screen.getByLabelText('Description').tagName).toBe('TEXTAREA');
  });

  test('is a controlled component: typing updates the rendered value', async () => {
    const user = userEvent.setup();
    render(<ControlledTextarea label="Review" />);

    const textarea = screen.getByLabelText('Review');
    await user.type(textarea, 'Great stay');

    expect(textarea).toHaveValue('Great stay');
  });

  test('honors the rows prop', () => {
    render(<ControlledTextarea label="Notes" rows={8} />);
    expect(screen.getByLabelText('Notes')).toHaveAttribute('rows', '8');
  });

  test('error is announced via role="alert" and linked with aria-describedby', () => {
    render(<ControlledTextarea label="Message" error="Message is required" />);

    const textarea = screen.getByLabelText('Message');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Message is required');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea.getAttribute('aria-describedby')).toContain(alert.id);
  });

  test('disabled textarea cannot receive typed input', async () => {
    const user = userEvent.setup();
    render(<ControlledTextarea label="Bio" disabled />);

    const textarea = screen.getByLabelText('Bio');
    expect(textarea).toBeDisabled();

    await user.type(textarea, 'x');
    expect(textarea).toHaveValue('');
  });

  // Step L2.
  test('renders a live character count when maxLength is set, updating as the user types', async () => {
    const user = userEvent.setup();
    render(<ControlledTextarea label="Description" maxLength={20000} />);

    expect(screen.getByText('0/20000')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Description'), 'A lovely place');
    expect(screen.getByText('14/20000')).toBeInTheDocument();
  });

  test('no character count renders when maxLength is not set', () => {
    render(<ControlledTextarea label="Description" />);
    expect(screen.queryByText(/^\d+\/\d+$/)).not.toBeInTheDocument();
  });
});
