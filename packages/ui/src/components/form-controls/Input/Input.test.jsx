import { useState } from 'react';
import PropTypes from 'prop-types';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Input from './Input.jsx';

function ControlledInput({ initialValue = '', ...rest }) {
  const [value, setValue] = useState(initialValue);
  return (
    // eslint-disable-next-line react/jsx-props-no-spreading -- test helper forwards arbitrary Input props
    <Input {...rest} value={value} onChange={(e) => setValue(e.target.value)} />
  );
}

ControlledInput.propTypes = {
  initialValue: PropTypes.string,
};
describe('Input (COMPONENT_LIBRARY.md Part II §2)', () => {
  test('label is programmatically associated via htmlFor/id', () => {
    render(<ControlledInput label="Email address" />);
    const input = screen.getByLabelText('Email address');
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');
  });

  test('is a controlled component: typing calls onChange and updates the rendered value', async () => {
    const user = userEvent.setup();
    render(<ControlledInput label="Name" />);

    const input = screen.getByLabelText('Name');
    await user.type(input, 'Ani');

    expect(input).toHaveValue('Ani');
  });

  test('renders helperText when there is no error', () => {
    render(<ControlledInput label="Phone" helperText="Include country code" />);
    expect(screen.getByText('Include country code')).toBeInTheDocument();
  });

  test('error is announced via role="alert" and linked with aria-describedby, replacing helperText', () => {
    render(
      <ControlledInput
        label="Email"
        helperText="We never share this"
        error="Enter a valid email address"
      />,
    );

    const input = screen.getByLabelText('Email');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Enter a valid email address');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(alert.id);
    expect(screen.queryByText('We never share this')).not.toBeInTheDocument();
  });

  test('disabled input cannot receive typed input', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Input label="Code" value="" onChange={onChange} disabled />);

    const input = screen.getByLabelText('Code');
    expect(input).toBeDisabled();

    await user.type(input, 'x');
    expect(onChange).not.toHaveBeenCalled();
  });

  // Step L2.
  test('renders a live character count when maxLength is set, updating as the user types', async () => {
    const user = userEvent.setup();
    render(<ControlledInput label="Title" maxLength={255} />);

    expect(screen.getByText('0/255')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Title'), 'Cozy Loft');
    expect(screen.getByText('9/255')).toBeInTheDocument();
  });

  test('character count is referenced via aria-describedby alongside helperText', () => {
    render(
      <ControlledInput
        initialValue="Cozy"
        label="Title"
        helperText="Keep it short and specific."
        maxLength={255}
      />,
    );
    const input = screen.getByLabelText('Title');
    const helper = screen.getByText('Keep it short and specific.');
    const count = screen.getByText('4/255');
    expect(input.getAttribute('aria-describedby')).toContain(helper.id);
    expect(input.getAttribute('aria-describedby')).toContain(count.id);
  });

  test('no character count renders when maxLength is not set', () => {
    render(<ControlledInput label="Title" />);
    expect(screen.queryByText(/^\d+\/\d+$/)).not.toBeInTheDocument();
  });

  test('renders iconLeft and iconRight content', () => {
    render(
      <ControlledInput
        label="Search"
        iconLeft={<svg data-testid="icon-left" />}
        iconRight={<svg data-testid="icon-right" />}
      />,
    );

    expect(screen.getByTestId('icon-left')).toBeInTheDocument();
    expect(screen.getByTestId('icon-right')).toBeInTheDocument();
  });
});
