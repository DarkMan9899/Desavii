import { useState } from 'react';
import PropTypes from 'prop-types';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NumberStepperField from './NumberStepperField.jsx';

function ControlledStepper({ initialValue = undefined, ...rest }) {
  const [value, setValue] = useState(initialValue);
  return (
    <NumberStepperField
      // eslint-disable-next-line react/jsx-props-no-spreading -- test helper forwards arbitrary props
      {...rest}
      value={value}
      onChange={setValue}
    />
  );
}

ControlledStepper.propTypes = {
  initialValue: PropTypes.number,
};

describe('NumberStepperField (PartnerListingWizard)', () => {
  test('label is programmatically associated via htmlFor/id', () => {
    render(
      <ControlledStepper
        label="Bedrooms"
        decreaseAriaLabel="Decrease Bedrooms"
        increaseAriaLabel="Increase Bedrooms"
        initialValue={2}
      />,
    );
    expect(screen.getByLabelText('Bedrooms')).toHaveValue(2);
  });

  test('the increase button increments the value by step', async () => {
    const user = userEvent.setup();
    render(
      <ControlledStepper
        label="Bedrooms"
        decreaseAriaLabel="Decrease Bedrooms"
        increaseAriaLabel="Increase Bedrooms"
        initialValue={2}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Increase Bedrooms' }));
    expect(screen.getByLabelText('Bedrooms')).toHaveValue(3);
  });

  test('the decrease button decrements the value by step', async () => {
    const user = userEvent.setup();
    render(
      <ControlledStepper
        label="Bedrooms"
        decreaseAriaLabel="Decrease Bedrooms"
        increaseAriaLabel="Increase Bedrooms"
        initialValue={2}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Decrease Bedrooms' }));
    expect(screen.getByLabelText('Bedrooms')).toHaveValue(1);
  });

  test('the decrease button is disabled at min', () => {
    render(
      <ControlledStepper
        label="Bedrooms"
        decreaseAriaLabel="Decrease Bedrooms"
        increaseAriaLabel="Increase Bedrooms"
        initialValue={0}
        min={0}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Decrease Bedrooms' }),
    ).toBeDisabled();
  });

  test('the increase button is disabled at max', () => {
    render(
      <ControlledStepper
        label="Seats"
        decreaseAriaLabel="Decrease Seats"
        increaseAriaLabel="Increase Seats"
        initialValue={5}
        max={5}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Increase Seats' }),
    ).toBeDisabled();
  });

  test('typing directly into the field calls onChange, clamped to min/max', () => {
    const onChange = vi.fn();
    render(
      <NumberStepperField
        label="Bedrooms"
        decreaseAriaLabel="Decrease Bedrooms"
        increaseAriaLabel="Increase Bedrooms"
        value={2}
        min={0}
        max={10}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText('Bedrooms');
    // fireEvent.change avoids userEvent's per-keystroke typing semantics,
    // which don't apply cleanly to a native number input.
    fireEvent.change(input, { target: { value: '15' } });
    expect(onChange).toHaveBeenCalledWith(10);
  });

  test('renders the unit label when given', () => {
    render(
      <ControlledStepper
        label="Duration"
        unit="hours"
        decreaseAriaLabel="Decrease Duration"
        increaseAriaLabel="Increase Duration"
        initialValue={2}
      />,
    );
    expect(screen.getByText('hours')).toBeInTheDocument();
  });

  test('renders an error via role="alert"', () => {
    render(
      <ControlledStepper
        label="Bedrooms"
        decreaseAriaLabel="Decrease Bedrooms"
        increaseAriaLabel="Increase Bedrooms"
        initialValue={2}
        error="Bedrooms is required"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Bedrooms is required');
  });

  // Step L4 (brief §10, §12, §18): integer-only enforcement and
  // scientific-notation rejection for the typed-input path — the +/-
  // step buttons already can't produce either case on their own.
  describe('numeric hardening (Step L4)', () => {
    test('integerOnly rejects a typed decimal value — onChange is never called', () => {
      const onChange = vi.fn();
      render(
        <NumberStepperField
          label="Seats"
          decreaseAriaLabel="Decrease Seats"
          increaseAriaLabel="Increase Seats"
          value={2}
          min={1}
          max={60}
          integerOnly
          onChange={onChange}
        />,
      );
      fireEvent.change(screen.getByLabelText('Seats'), {
        target: { value: '2.5' },
      });
      expect(onChange).not.toHaveBeenCalled();
    });

    test('without integerOnly, a typed decimal value is accepted (DECIMAL attributes, e.g. bathrooms)', () => {
      const onChange = vi.fn();
      render(
        <NumberStepperField
          label="Bathrooms"
          decreaseAriaLabel="Decrease Bathrooms"
          increaseAriaLabel="Increase Bathrooms"
          value={1}
          min={0}
          max={10}
          onChange={onChange}
        />,
      );
      fireEvent.change(screen.getByLabelText('Bathrooms'), {
        target: { value: '1.5' },
      });
      expect(onChange).toHaveBeenCalledWith(1.5);
    });

    test('scientific notation is rejected — onChange is never called', () => {
      const onChange = vi.fn();
      render(
        <NumberStepperField
          label="Seats"
          decreaseAriaLabel="Decrease Seats"
          increaseAriaLabel="Increase Seats"
          value={2}
          max={60}
          onChange={onChange}
        />,
      );
      fireEvent.change(screen.getByLabelText('Seats'), {
        target: { value: '1e3' },
      });
      expect(onChange).not.toHaveBeenCalled();
    });

    test('a typed integer value is still accepted with integerOnly set', () => {
      const onChange = vi.fn();
      render(
        <NumberStepperField
          label="Seats"
          decreaseAriaLabel="Decrease Seats"
          increaseAriaLabel="Increase Seats"
          value={2}
          min={1}
          max={60}
          integerOnly
          onChange={onChange}
        />,
      );
      fireEvent.change(screen.getByLabelText('Seats'), {
        target: { value: '7' },
      });
      expect(onChange).toHaveBeenCalledWith(7);
    });

    test('a negative typed value is clamped to min when one is set', () => {
      const onChange = vi.fn();
      render(
        <NumberStepperField
          label="Seats"
          decreaseAriaLabel="Decrease Seats"
          increaseAriaLabel="Increase Seats"
          value={2}
          min={1}
          integerOnly
          onChange={onChange}
        />,
      );
      fireEvent.change(screen.getByLabelText('Seats'), {
        target: { value: '-5' },
      });
      expect(onChange).toHaveBeenCalledWith(1);
    });
  });
});
