import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ItemForm from './ItemForm.jsx';

// Step L4.1 (brief §8, §12-13, §20, §25) — `priceAmount` mirrors the
// backend's own `decimalMoneyAmountSchema` exactly (nonnegative — zero
// stays allowed here, unlike `BookableUnitForm`'s `basePriceAmount` — the
// real DECIMAL(12,2) ceiling, at-most-2-decimal-places), and it's a
// REQUIRED field on `createItemSchema`, so a blank value is its own
// distinct error.
describe('ItemForm (PartnerMenuManager, Step L4.1)', () => {
  test('a blank price is rejected with a specific "enter a price" message, onSubmit never called', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ItemForm submitLabel="Պահպանել" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/^Ուտեստի անվանում/), 'Khorovats');
    await user.click(screen.getByRole('button', { name: 'Պահպանել' }));

    expect(await screen.findByText('Մուտքագրեք գին։')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('a negative price is rejected, onSubmit never called', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ItemForm submitLabel="Պահպանել" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/^Ուտեստի անվանում/), 'Khorovats');
    await user.type(screen.getByLabelText(/^Գին/), '-5');
    await user.click(screen.getByRole('button', { name: 'Պահպանել' }));

    expect(
      await screen.findByText('Գինը չի կարող բացասական լինել։'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('a price with more than 2 decimal places is rejected, onSubmit never called', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ItemForm submitLabel="Պահպանել" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/^Ուտեստի անվանում/), 'Khorovats');
    await user.type(screen.getByLabelText(/^Գին/), '19.999');
    await user.click(screen.getByRole('button', { name: 'Պահպանել' }));

    expect(
      await screen.findByText(
        'Մուտքագրեք գին՝ ոչ ավելի, քան 2 տասնորդական նիշով։',
      ),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('a price above the DECIMAL(12,2) max is rejected, onSubmit never called', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ItemForm submitLabel="Պահպանել" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/^Ուտեստի անվանում/), 'Khorovats');
    await user.type(screen.getByLabelText(/^Գին/), '10000000000');
    await user.click(screen.getByRole('button', { name: 'Պահպանել' }));

    expect(
      await screen.findByText('Գումարը չափազանց մեծ է։'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('zero is accepted — the existing nonnegative contract is unchanged by L4.1', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ItemForm submitLabel="Պահպանել" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/^Ուտեստի անվանում/), 'Herbal Tea');
    await user.type(screen.getByLabelText(/^Գին/), '0');
    await user.click(screen.getByRole('button', { name: 'Պահպանել' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ priceAmount: 0 }),
    );
  });

  test('a valid two-decimal price is accepted', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ItemForm submitLabel="Պահպանել" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/^Ուտեստի անվանում/), 'Khorovats');
    await user.type(screen.getByLabelText(/^Գին/), '19.99');
    await user.click(screen.getByRole('button', { name: 'Պահպանել' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ priceAmount: 19.99 }),
    );
  });
});
