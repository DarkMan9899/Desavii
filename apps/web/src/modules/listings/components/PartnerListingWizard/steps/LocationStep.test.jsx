import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LocationStep from './LocationStep.jsx';
import { useUpdateListingMutation } from '../../../mutations/useUpdateListingMutation.js';
import { useDestinationsQuery } from '../../../../search/index.js';

vi.mock('../../../mutations/useUpdateListingMutation.js', () => ({
  useUpdateListingMutation: vi.fn(),
}));
vi.mock('../../../../search/index.js', () => ({
  useDestinationsQuery: vi.fn(),
}));

const CITIES = [
  { id: 1, name: 'Երևան', latitude: '40.1772', longitude: '44.5035' },
  { id: 9, name: 'Գառնի', latitude: '40.1194', longitude: '44.7300' },
];

async function chooseCity(user, name) {
  await user.click(
    screen.getByRole('combobox', { name: /Քաղաք կամ բնակավայր/ }),
  );
  await user.click(screen.getByRole('option', { name }));
}

async function typeCoordinates(user, latitude, longitude) {
  await user.type(screen.getByLabelText(/Լայնություն/), latitude);
  await user.type(screen.getByLabelText(/Երկայնություն/), longitude);
}

describe('LocationStep (PartnerListingWizard)', () => {
  let mutateAsync;

  beforeEach(() => {
    mutateAsync = vi.fn().mockResolvedValue({ data: { id: 7 } });
    useUpdateListingMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: null,
    });
    useDestinationsQuery.mockReturnValue({ data: CITIES, isPending: false });
  });

  test('submits the city, the trimmed address and numeric coordinates, then onNext', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<LocationStep listingId={7} onNext={onNext} />);

    await chooseCity(user, 'Գառնի');
    await user.type(
      screen.getByLabelText(/Փողոցի հասցե/),
      '  12 Charents St  ',
    );
    await typeCoordinates(user, '40.18', '44.5');
    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith({
      id: 7,
      payload: {
        location: {
          cityId: 9,
          addressLine: '12 Charents St',
          latitude: 40.18,
          longitude: 44.5,
        },
      },
    });
    expect(onNext).toHaveBeenCalled();
  });

  test('a city is required: Continue without one never saves', async () => {
    const user = userEvent.setup();
    render(<LocationStep listingId={7} onNext={vi.fn()} />);

    await typeCoordinates(user, '40.18', '44.5');
    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

    expect(
      await screen.findByText(
        'Ընտրեք այն քաղաքը, որտեղ գտնվում է հայտարարությունը։',
      ),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  test('resumes a stored location (edit/resume parity)', async () => {
    const user = userEvent.setup();
    render(
      <LocationStep
        listingId={7}
        onNext={vi.fn()}
        initialValues={{
          cityId: 1,
          addressLine: '5 Abovyan St',
          latitude: 40.1772,
          longitude: 44.5035,
        }}
      />,
    );

    expect(
      screen.getByRole('combobox', { name: /Քաղաք կամ բնակավայր/ }),
    ).toHaveTextContent('Երևան');
    expect(screen.getByLabelText(/Փողոցի հասցե/)).toHaveValue('5 Abovyan St');

    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        id: 7,
        payload: {
          location: {
            cityId: 1,
            addressLine: '5 Abovyan St',
            latitude: 40.1772,
            longitude: 44.5035,
          },
        },
      }),
    );
  });

  test('a private stay says its address and pin stay private; a venue says the address is public', () => {
    const { unmount } = render(
      <LocationStep listingId={7} listingType="PROPERTY" onNext={vi.fn()} />,
    );
    expect(
      screen.getByText(
        'Մնում է գաղտնի։ Մինչև ամրագրումը հյուրերը տեսնում են միայն մոտավոր տարածքը։',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/հանրային քարտեզը ցույց է տալիս մոտավոր տարածք/),
    ).toBeInTheDocument();
    unmount();

    render(
      <LocationStep listingId={7} listingType="RESTAURANT" onNext={vi.fn()} />,
    );
    expect(
      screen.getByText(
        'Ցուցադրվում է հյուրերին, որպեսզի նրանք կարողանան գտնել ձեզ։',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/հանրային քարտեզը ցույց է տալիս մոտավոր տարածք/),
    ).not.toBeInTheDocument();
  });

  test('missing coordinates blocks submission', async () => {
    const user = userEvent.setup();
    render(<LocationStep listingId={7} onNext={vi.fn()} />);

    await chooseCity(user, 'Երևան');
    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

    const errors = await screen.findAllByText('Այս դաշտը պարտադիր է։');
    expect(errors.length).toBeGreaterThan(0);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  test('an out-of-range latitude is rejected', async () => {
    const user = userEvent.setup();
    render(<LocationStep listingId={7} onNext={vi.fn()} />);

    await chooseCity(user, 'Երևան');
    await typeCoordinates(user, '200', '44.5');
    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

    expect(
      await screen.findByText('Լայնությունը պետք է լինի -90-ից 90-ի միջև։'),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  test('a server UNKNOWN_CITY rejection lands on the city field', () => {
    useUpdateListingMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: {
        status: 422,
        code: 'VALIDATION_ERROR',
        details: [{ path: 'location.cityId', issue: 'UNKNOWN_CITY' }],
      },
    });
    render(<LocationStep listingId={7} onNext={vi.fn()} />);

    expect(screen.getByText('Ընտրեք քաղաքը ցանկից։')).toBeInTheDocument();
  });

  // Step L2 (brief §13): raw coordinates sit behind a collapsed, clearly
  // labeled disclosure since the map already sets both fields — but an
  // error inside it must never be silently hidden.
  describe('coordinates disclosure (Step L2)', () => {
    test('the manual coordinate fields are collapsed behind a disclosure by default', () => {
      render(<LocationStep listingId={7} onNext={vi.fn()} />);

      const details = screen
        .getByText('Մուտքագրել կոորդինատները ձեռքով')
        .closest('details');
      expect(details).not.toHaveAttribute('open');
    });

    test('the disclosure auto-opens when Continue is clicked with no coordinates picked', async () => {
      const user = userEvent.setup();
      render(<LocationStep listingId={7} onNext={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

      const details = await screen
        .findByText('Մուտքագրել կոորդինատները ձեռքով')
        .then((summary) => summary.closest('details'));
      expect(details).toHaveAttribute('open');
    });
  });

  test('renders no Back button when onBack is not given (first-in-flow edge case)', () => {
    render(<LocationStep listingId={7} onNext={vi.fn()} />);
    expect(
      screen.queryByRole('button', { name: 'Հետ' }),
    ).not.toBeInTheDocument();
  });

  test('clicking Back calls onBack', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<LocationStep listingId={7} onNext={vi.fn()} onBack={onBack} />);
    await user.click(screen.getByRole('button', { name: 'Հետ' }));
    expect(onBack).toHaveBeenCalled();
  });
});
