import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import PricingStep from './PricingStep.jsx';
import { useListingMetadataQuery } from '../../../queries/useListingMetadataQuery.js';
import { useUpdateListingMutation } from '../../../mutations/useUpdateListingMutation.js';

vi.mock('../../../queries/useListingMetadataQuery.js', () => ({
  useListingMetadataQuery: vi.fn(),
}));
vi.mock('../../../mutations/useUpdateListingMutation.js', () => ({
  useUpdateListingMutation: vi.fn(),
}));

describe('PricingStep (PartnerListingWizard)', () => {
  let mutateAsync;

  beforeEach(() => {
    mutateAsync = vi.fn().mockResolvedValue({ data: {} });
    useUpdateListingMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: null,
    });
  });

  test('renders an empty-state message and skips pricing entirely when the category has no pricing models', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { pricing_models: [] },
    });
    render(<PricingStep listingId={7} categoryId={3} onNext={onNext} />);
    expect(
      screen.getByText('Այս կատեգորիան գների մոդել չունի։'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
  });

  // Step L2 (brief §11): a short intro explains what the base price
  // means before the fields, and the Amount field's helper text starts
  // generic, then names the chosen model's own basis once one is picked
  // — never a second, separately-maintained copy of the model labels.
  describe('pricing clarity (Step L2)', () => {
    test('shows a step intro explaining the base price when pricing models exist', () => {
      useListingMetadataQuery.mockReturnValue({
        isPending: false,
        isError: false,
        data: { pricing_models: [{ code: 'PER_NIGHT' }] },
      });
      render(<PricingStep listingId={7} categoryId={3} onNext={vi.fn()} />);

      expect(
        screen.getByText(
          'Սահմանեք հիմնական գին այս հայտարարության համար։ Այն կիրառվում է որպես կանխադրված, եթե կոնկրետ ամսաթիվը կամ սենյակը չունի սեփական գին։',
        ),
      ).toBeInTheDocument();
    });

    test('the amount field starts with a generic hint before a pricing model is chosen', () => {
      useListingMetadataQuery.mockReturnValue({
        isPending: false,
        isError: false,
        data: { pricing_models: [{ code: 'PER_NIGHT' }] },
      });
      render(<PricingStep listingId={7} categoryId={3} onNext={vi.fn()} />);

      expect(
        screen.getByText(
          'Ընտրեք գնագոյացման մոդել վերևում՝ տեսնելու համար, թե ինչին է վերաբերում այս գումարը։',
        ),
      ).toBeInTheDocument();
    });

    test("the amount field names the chosen model's basis once a pricing model is selected", async () => {
      const user = userEvent.setup();
      useListingMetadataQuery.mockReturnValue({
        isPending: false,
        isError: false,
        data: { pricing_models: [{ code: 'PER_NIGHT' }] },
      });
      render(<PricingStep listingId={7} categoryId={3} onNext={vi.fn()} />);

      const [modelTrigger] = screen.getAllByTestId('select-trigger');
      await user.click(modelTrigger);
      await user.click(screen.getByRole('option', { name: 'Գիշերվա համար' }));

      expect(screen.getByText('Գինը գիշերվա համար։')).toBeInTheDocument();
    });
  });

  test('filling in model + amount + currency calls updateListing with a numeric amount', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { pricing_models: [{ code: 'PER_NIGHT' }] },
    });
    render(<PricingStep listingId={7} categoryId={3} onNext={onNext} />);

    const [modelTrigger, currencyTrigger] =
      screen.getAllByTestId('select-trigger');
    await user.click(modelTrigger);
    await user.click(screen.getByRole('option', { name: 'Գիշերվա համար' }));

    await user.type(screen.getByLabelText('Գումար'), '150');

    await user.click(currencyTrigger);
    await user.click(screen.getByRole('option', { name: 'AMD' }));

    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith({
      id: 7,
      payload: {
        pricing: { modelCode: 'PER_NIGHT', amount: 150, currencyCode: 'AMD' },
      },
    });
    expect(onNext).toHaveBeenCalled();
  });

  test('an incomplete pricing form (e.g. no currency chosen) skips the PATCH and still proceeds', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { pricing_models: [{ code: 'PER_NIGHT' }] },
    });
    render(<PricingStep listingId={7} categoryId={3} onNext={onNext} />);

    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
  });

  // Step L4 (brief §8, §12-13, §17-18, §25): amount validation matching
  // the backend's own nonnegative/precision/max-value contract.
  describe('amount validation (Step L4)', () => {
    async function fillModelAndCurrency(user) {
      const [modelTrigger, currencyTrigger] =
        screen.getAllByTestId('select-trigger');
      await user.click(modelTrigger);
      await user.click(screen.getByRole('option', { name: 'Գիշերվա համար' }));
      await user.click(currencyTrigger);
      await user.click(screen.getByRole('option', { name: 'AMD' }));
    }

    test('a negative amount is rejected client-side, PATCH never sent', async () => {
      const user = userEvent.setup();
      const onNext = vi.fn();
      useListingMetadataQuery.mockReturnValue({
        isPending: false,
        isError: false,
        data: { pricing_models: [{ code: 'PER_NIGHT' }] },
      });
      render(<PricingStep listingId={7} categoryId={3} onNext={onNext} />);

      await fillModelAndCurrency(user);
      await user.type(screen.getByLabelText('Գումար'), '-50');
      await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

      expect(
        await screen.findByText('Գումարը չի կարող բացասական լինել։'),
      ).toBeInTheDocument();
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    test('zero is accepted (existing nonnegative contract, unchanged by L4)', async () => {
      const user = userEvent.setup();
      const onNext = vi.fn();
      useListingMetadataQuery.mockReturnValue({
        isPending: false,
        isError: false,
        data: { pricing_models: [{ code: 'PER_NIGHT' }] },
      });
      render(<PricingStep listingId={7} categoryId={3} onNext={onNext} />);

      await fillModelAndCurrency(user);
      await user.type(screen.getByLabelText('Գումար'), '0');
      await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
      expect(mutateAsync).toHaveBeenCalledWith({
        id: 7,
        payload: {
          pricing: { modelCode: 'PER_NIGHT', amount: 0, currencyCode: 'AMD' },
        },
      });
    });

    test('an amount with more than 2 decimal places is rejected client-side, PATCH never sent', async () => {
      const user = userEvent.setup();
      const onNext = vi.fn();
      useListingMetadataQuery.mockReturnValue({
        isPending: false,
        isError: false,
        data: { pricing_models: [{ code: 'PER_NIGHT' }] },
      });
      render(<PricingStep listingId={7} categoryId={3} onNext={onNext} />);

      await fillModelAndCurrency(user);
      await user.type(screen.getByLabelText('Գումար'), '19.999');
      await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

      expect(
        await screen.findByText(
          'Գումարը կարող է ունենալ առավելագույնը 2 տասնորդական նիշ։',
        ),
      ).toBeInTheDocument();
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    test('a valid two-decimal amount is accepted', async () => {
      const user = userEvent.setup();
      const onNext = vi.fn();
      useListingMetadataQuery.mockReturnValue({
        isPending: false,
        isError: false,
        data: { pricing_models: [{ code: 'PER_NIGHT' }] },
      });
      render(<PricingStep listingId={7} categoryId={3} onNext={onNext} />);

      await fillModelAndCurrency(user);
      await user.type(screen.getByLabelText('Գումար'), '19.99');
      await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
      expect(mutateAsync).toHaveBeenCalledWith({
        id: 7,
        payload: {
          pricing: {
            modelCode: 'PER_NIGHT',
            amount: 19.99,
            currencyCode: 'AMD',
          },
        },
      });
    });
  });
});

// Step L6.2H1: a stored pricing model the category no longer offers (legacy
// PER_HOUR) is flagged, never silently replaced, and blocks Continue until
// the Partner knowingly picks a supported one.
describe('PricingStep — legacy unsupported pricing model (Step L6.2H1)', () => {
  const LEGACY_VALUES = {
    modelCode: 'PER_HOUR',
    amount: 8000,
    currencyCode: 'AMD',
  };
  let mutateAsync;

  beforeEach(() => {
    mutateAsync = vi.fn().mockResolvedValue({ data: {} });
    useUpdateListingMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: null,
    });
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { pricing_models: [{ code: 'PER_PERSON' }] },
    });
  });

  test('the model select offers only supported models and starts empty for a legacy listing', async () => {
    const user = userEvent.setup();
    render(
      <PricingStep
        listingId={7}
        categoryId={3}
        initialValues={LEGACY_VALUES}
        onNext={vi.fn()}
      />,
    );

    expect(
      screen.getByText('«Ժամվա համար» գնագոյացումն այլևս չի աջակցվում'),
    ).toBeInTheDocument();
    const [modelTrigger] = screen.getAllByTestId('select-trigger');
    expect(modelTrigger).not.toHaveTextContent('Ժամվա համար');
    await user.click(modelTrigger);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Մեկ անձի համար',
    ]);
  });

  test('Continue is refused, with nothing saved, until a supported model is chosen', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(
      <PricingStep
        listingId={7}
        categoryId={3}
        initialValues={LEGACY_VALUES}
        onNext={onNext}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));
    expect(
      await screen.findByText(
        'Շարունակելու համար ընտրեք աջակցվող գնագոյացման մոդել։',
      ),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();

    const [modelTrigger] = screen.getAllByTestId('select-trigger');
    await user.click(modelTrigger);
    await user.click(screen.getByRole('option', { name: 'Մեկ անձի համար' }));
    expect(
      screen.queryByText('«Ժամվա համար» գնագոյացումն այլևս չի աջակցվում'),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith({
      id: 7,
      payload: {
        pricing: { modelCode: 'PER_PERSON', amount: 8000, currencyCode: 'AMD' },
      },
    });
    expect(onNext).toHaveBeenCalled();
  });

  test.each([
    [
      'en',
      '"Per hour" pricing is no longer supported',
      /Customers can't book this listing/,
    ],
    [
      'ru',
      'Модель «За час» больше не поддерживается',
      /Клиенты не смогут забронировать/,
    ],
    [
      'hy',
      '«Ժամվա համար» գնագոյացումն այլևս չի աջակցվում',
      /Հաճախորդները չեն կարող ամրագրել/,
    ],
  ])('the legacy notice is translated in %s', async (lng, title, body) => {
    await i18n.changeLanguage(lng);
    try {
      render(
        <PricingStep
          listingId={7}
          categoryId={3}
          initialValues={LEGACY_VALUES}
          onNext={vi.fn()}
        />,
      );
      expect(screen.getByText(title)).toBeInTheDocument();
      expect(screen.getByText(body)).toBeInTheDocument();
    } finally {
      await i18n.changeLanguage('hy');
    }
  });

  test('a category offering no models never traps the Partner on this step', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { pricing_models: [] },
    });
    render(
      <PricingStep
        listingId={7}
        categoryId={3}
        initialValues={LEGACY_VALUES}
        onNext={onNext}
      />,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));
    expect(onNext).toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  test('a supported stored model shows no legacy notice', () => {
    render(
      <PricingStep
        listingId={7}
        categoryId={3}
        initialValues={{ ...LEGACY_VALUES, modelCode: 'PER_PERSON' }}
        onNext={vi.fn()}
      />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
