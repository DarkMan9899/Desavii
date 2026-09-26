import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ApiError from '../../../../../api/ApiError.js';
import DynamicAttributesStep from './DynamicAttributesStep.jsx';
import { useListingMetadataQuery } from '../../../queries/useListingMetadataQuery.js';
import { useUpdateListingMutation } from '../../../mutations/useUpdateListingMutation.js';

vi.mock('../../../queries/useListingMetadataQuery.js', () => ({
  useListingMetadataQuery: vi.fn(),
}));
vi.mock('../../../mutations/useUpdateListingMutation.js', () => ({
  useUpdateListingMutation: vi.fn(),
}));

const ATTRIBUTES = [
  {
    code: 'bedrooms',
    data_type: 'INTEGER',
    unit: 'rooms',
    min: 0,
    max: 10,
    is_required: true,
  },
  {
    code: 'pool',
    data_type: 'BOOLEAN',
    is_required: false,
  },
];

describe('DynamicAttributesStep (PartnerListingWizard)', () => {
  let mutateAsync;

  beforeEach(() => {
    mutateAsync = vi.fn().mockResolvedValue({ data: {} });
    useUpdateListingMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: null,
    });
  });

  test('renders a loading spinner while metadata is pending', () => {
    useListingMetadataQuery.mockReturnValue({ isPending: true });
    render(
      <DynamicAttributesStep listingId={7} categoryId={3} onNext={vi.fn()} />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('renders an ErrorState with retry on failure', async () => {
    const refetch = vi.fn();
    const user = userEvent.setup();
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: true,
      refetch,
    });
    render(
      <DynamicAttributesStep listingId={7} categoryId={3} onNext={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: 'Կրկնել' }));
    expect(refetch).toHaveBeenCalled();
  });

  test('renders every attribute via MetadataFieldRenderer', () => {
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { attributes: ATTRIBUTES },
    });
    render(
      <DynamicAttributesStep listingId={7} categoryId={3} onNext={vi.fn()} />,
    );
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'pool' })).toBeInTheDocument();
  });

  test('a missing required attribute blocks Continue with an inline error', async () => {
    const user = userEvent.setup();
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { attributes: ATTRIBUTES },
    });
    render(
      <DynamicAttributesStep listingId={7} categoryId={3} onNext={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));
    expect(
      await screen.findByText('Այս դաշտը պարտադիր է։'),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  test('submitting valid values converts to the attributeValues wire shape and calls onNext', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { attributes: ATTRIBUTES },
    });
    render(
      <DynamicAttributesStep
        listingId={7}
        categoryId={3}
        initialValues={{ bedrooms: 2 }}
        onNext={onNext}
      />,
    );

    await user.click(screen.getByRole('switch', { name: 'pool' }));
    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith({
      id: 7,
      payload: {
        attributeValues: [
          { code: 'bedrooms', value: 2 },
          { code: 'pool', value: true },
        ],
      },
    });
    expect(onNext).toHaveBeenCalled();
  });

  test('renders an empty-state message when the category has no attributes', () => {
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { attributes: [] },
    });
    render(
      <DynamicAttributesStep listingId={7} categoryId={3} onNext={vi.fn()} />,
    );
    expect(
      screen.getByText('Այս կատեգորիան լրացուցիչ մանրամասներ չունի։'),
    ).toBeInTheDocument();
  });
  // Step L5: the backend names the attribute (`attributeValues.<code>`),
  // so its error lands on that attribute's own field.
  test('a server error for one attribute is shown on that attribute field only', () => {
    useListingMetadataQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { attributes: ATTRIBUTES },
    });
    useUpdateListingMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: new ApiError({
        code: 'VALIDATION_FAILED',
        status: 422,
        message: 'bedrooms must be at most 10.',
        details: [
          {
            field: 'attributeValues.bedrooms',
            issue: 'ABOVE_MAXIMUM',
            maximum: 10,
          },
        ],
      }),
    });
    render(
      <DynamicAttributesStep listingId={7} categoryId={3} onNext={vi.fn()} />,
    );

    expect(screen.getByText('Առավելագույնը 10 է։')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('bedrooms must be at most');
  });
});
