import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import PropTypes from 'prop-types';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ToastProvider from '../../../../../providers/ToastProvider.jsx';
import BasicInfoStep from './BasicInfoStep.jsx';
import { useCreateListingMutation } from '../../../mutations/useCreateListingMutation.js';
import { useUpdateListingMutation } from '../../../mutations/useUpdateListingMutation.js';

vi.mock('../../../mutations/useCreateListingMutation.js', () => ({
  useCreateListingMutation: vi.fn(),
}));
vi.mock('../../../mutations/useUpdateListingMutation.js', () => ({
  useUpdateListingMutation: vi.fn(),
}));

const PARTNERSHIPS = [
  {
    partner_id: 1,
    slug: 'yerevan-boutique-hospitality',
    display_name: 'Yerevan Boutique Hospitality',
  },
];

// A real Wizard lifts `authoringLocale` (see `useListingWizardState.js`)
// — this harness mirrors that instead of hardcoding a fixed prop, so
// these tests exercise the actual controlled-locale contract, not a
// stand-in that could drift from it.
function Harness({
  startLocale = 'en',
  partnerships = PARTNERSHIPS,
  listingId = null,
  categoryId = null,
  initialTranslations = [],
  onCreated = vi.fn(),
  onNext = vi.fn(),
}) {
  const [authoringLocale, setAuthoringLocale] = useState(startLocale);
  return (
    <BasicInfoStep
      partnerships={partnerships}
      listingId={listingId}
      categoryId={categoryId}
      initialTranslations={initialTranslations}
      onCreated={onCreated}
      onNext={onNext}
      authoringLocale={authoringLocale}
      onAuthoringLocaleChange={setAuthoringLocale}
    />
  );
}

Harness.propTypes = {
  startLocale: PropTypes.string,
  // eslint-disable-next-line react/forbid-prop-types -- test harness passthrough
  partnerships: PropTypes.array,
  listingId: PropTypes.number,
  categoryId: PropTypes.number,
  // eslint-disable-next-line react/forbid-prop-types -- test harness passthrough
  initialTranslations: PropTypes.array,
  onCreated: PropTypes.func,
  onNext: PropTypes.func,
};

function renderStep({
  startLocale = 'en',
  partnerships = PARTNERSHIPS,
  listingId = null,
  categoryId = null,
  initialTranslations = [],
  onCreated = vi.fn(),
  onNext = vi.fn(),
} = {}) {
  return render(
    <MemoryRouter initialEntries={['/en/partner/listings/new']}>
      <ToastProvider>
        <Routes>
          <Route
            path="/:locale/partner/listings/new"
            element={
              <Harness
                startLocale={startLocale}
                partnerships={partnerships}
                listingId={listingId}
                categoryId={categoryId}
                initialTranslations={initialTranslations}
                onCreated={onCreated}
                onNext={onNext}
              />
            }
          />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('BasicInfoStep (PartnerListingWizard)', () => {
  let createMutateAsync;
  let updateMutateAsync;

  beforeEach(() => {
    createMutateAsync = vi.fn().mockResolvedValue({ data: { id: 42 } });
    updateMutateAsync = vi.fn().mockResolvedValue({ data: { id: 7 } });
    useCreateListingMutation.mockReturnValue({
      mutateAsync: createMutateAsync,
      isPending: false,
      error: null,
    });
    useUpdateListingMutation.mockReturnValue({
      mutateAsync: updateMutateAsync,
      isPending: false,
      error: null,
    });
  });

  test('shows listingType and (multi-partner) partner selects when no listing exists yet', () => {
    renderStep({
      partnerships: [
        ...PARTNERSHIPS,
        {
          partner_id: 2,
          slug: 'second-partner',
          display_name: 'Second Partner',
        },
      ],
    });
    expect(screen.getByText('Գործընկեր կազմակերպություն')).toBeInTheDocument();
    expect(screen.getByText('Հայտարարության տեսակ')).toBeInTheDocument();
  });

  test('hides the partner select when the partner has exactly one partnership', () => {
    renderStep({});
    expect(
      screen.queryByText('Գործընկեր կազմակերպություն'),
    ).not.toBeInTheDocument();
  });

  test('submitting with no listing yet calls createListing with translations + categoryIds for the active locale, then onCreated', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const onNext = vi.fn();
    renderStep({ categoryId: 3, onCreated, onNext });

    await user.click(screen.getByTestId('select-trigger'));
    await user.click(screen.getByRole('option', { name: 'Հյուրանոց' }));
    await user.type(
      screen.getByLabelText(/Վերնագիր/),
      'Boutique Yerevan Hotel',
    );
    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerId: 1,
        listingType: 'HOTEL',
        categoryIds: [3],
        translations: [
          // authoringLocale defaults to 'en' (the platform content
          // default), languageId 1 per LANGUAGE_ID_BY_LOCALE — not the
          // route's ':locale' (this harness renders at /en, so it isn't
          // distinguishing evidence on its own; the dedicated
          // "authoringLocale, not UI locale" test below is).
          expect.objectContaining({
            languageId: 1,
            title: 'Boutique Yerevan Hotel',
          }),
        ],
      }),
    );
    expect(onCreated).toHaveBeenCalledWith(42);
    expect(onNext).not.toHaveBeenCalled();
  });

  test('once a listing exists, only translations are editable; Continue saves the active locale and advances', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    renderStep({
      listingId: 7,
      initialTranslations: [{ language_code: 'en', title: 'Existing title' }],
      onNext,
    });

    expect(screen.queryByText('Հայտարարության տեսակ')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Վերնագիր/)).toHaveValue('Existing title');

    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: 7,
      payload: {
        translations: [
          expect.objectContaining({ languageId: 1, title: 'Existing title' }),
        ],
      },
    });
    expect(onNext).toHaveBeenCalled();
  });

  test('a missing title in the active locale blocks submission with a validation error', async () => {
    const user = userEvent.setup();
    renderStep({});
    await user.click(screen.getByRole('button', { name: 'Շարունակել' }));
    const errors = await screen.findAllByText('Այս դաշտը պարտադիր է։');
    expect(errors.length).toBeGreaterThan(0);
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  // 2026 Partner Workspace redesign (Sprint 3) — the core new guarantee.
  describe('multilingual authoring', () => {
    test('each locale loads only its own persisted translation, never another locale as a fallback', () => {
      renderStep({
        listingId: 7,
        startLocale: 'hy',
        initialTranslations: [{ language_code: 'en', title: 'English title' }],
      });
      // hy has no persisted row — the editor must show genuinely empty,
      // not the English title standing in for it.
      expect(screen.getByLabelText(/Վերնագիր/)).toHaveValue('');
    });

    test('switching authoring locale preserves an unsaved edit — typing in en, switching to hy and back does not lose it', async () => {
      const user = userEvent.setup();
      renderStep({ listingId: 7, initialTranslations: [] });

      await user.type(screen.getByLabelText(/Վերնագիր/), 'Draft in English');
      await user.click(screen.getByRole('tab', { name: /Հայերեն/ }));
      expect(screen.getByLabelText(/Վերնագիր/)).toHaveValue('');

      await user.click(screen.getByRole('tab', { name: /English/ }));
      expect(screen.getByLabelText(/Վերնագիր/)).toHaveValue('Draft in English');
    });

    // Sprint L — reproduces and closes a real data-loss bug: `POST
    // /listings` only ever persists ONE translation (the locale active
    // at the moment Continue is clicked), so a partner who typed into
    // more than one locale before the listing existed used to have
    // every OTHER locale's draft silently discarded the instant the
    // wizard advanced past this step and it unmounted.
    test('creating the listing while multiple locale drafts are unsaved persists every one of them, not just the active locale', async () => {
      const user = userEvent.setup();
      const onCreated = vi.fn();
      renderStep({ onCreated });

      await user.click(screen.getByTestId('select-trigger'));
      await user.click(screen.getByRole('option', { name: 'Հյուրանոց' }));

      // startLocale defaults to 'en' — type the English draft first.
      await user.type(
        screen.getByLabelText(/Վերնագիր/),
        'Boutique Yerevan Hotel',
      );
      // Switch to Armenian and type a second draft before ever submitting.
      await user.click(screen.getByRole('tab', { name: /Հայերեն/ }));
      await user.type(
        screen.getByLabelText(/Վերնագիր/),
        'Բուտիկ հյուրանոց Երևանում',
      );
      // Switch back to English, the locale active at submit time.
      await user.click(screen.getByRole('tab', { name: /English/ }));

      await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

      await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
      expect(createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          translations: [
            expect.objectContaining({
              languageId: 1,
              title: 'Boutique Yerevan Hotel',
            }),
          ],
        }),
      );

      // The Armenian draft — never sent by createListing — must be
      // saved separately against the newly created listing's real id.
      await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: 42,
        payload: {
          translations: [
            expect.objectContaining({
              languageId: 2,
              title: 'Բուտիկ հյուրանոց Երևանում',
            }),
          ],
        },
      });
      expect(onCreated).toHaveBeenCalledWith(42);
    });

    test('creating the listing with only one locale filled in never calls the extra-locale save', async () => {
      const user = userEvent.setup();
      renderStep({});

      await user.click(screen.getByTestId('select-trigger'));
      await user.click(screen.getByRole('option', { name: 'Հյուրանոց' }));
      await user.type(
        screen.getByLabelText(/Վերնագիր/),
        'Boutique Yerevan Hotel',
      );
      await user.click(screen.getByRole('button', { name: 'Շարունակել' }));

      await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
      expect(updateMutateAsync).not.toHaveBeenCalled();
    });

    test('the standalone "Save translation" button saves only the active locale, without advancing the step', async () => {
      const user = userEvent.setup();
      const onNext = vi.fn();
      renderStep({
        listingId: 7,
        startLocale: 'hy',
        initialTranslations: [],
        onNext,
      });

      await user.type(screen.getByLabelText(/Վերնագիր/), 'Հայկական վերնագիր');
      await user.click(
        screen.getByRole('button', {
          name: /Պահպանել Հայերեն թարգմանությունը/,
        }),
      );

      await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: 7,
        payload: {
          translations: [
            expect.objectContaining({
              languageId: 2,
              title: 'Հայկական վերնագիր',
            }),
          ],
        },
      });
      expect(onNext).not.toHaveBeenCalled();
    });

    test('the standalone save button is hidden before a listing exists', () => {
      renderStep({});
      expect(
        screen.queryByRole('button', { name: /թարգմանությունը$/ }),
      ).not.toBeInTheDocument();
    });

    test('the locale tabs show a completion mark only for locales with a real title', () => {
      renderStep({
        listingId: 7,
        initialTranslations: [{ language_code: 'en', title: 'English title' }],
      });
      expect(
        screen.getByRole('tab', { name: /English ✓/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('tab', { name: /Հայերեն ·/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('tab', { name: /Русский ·/ }),
      ).toBeInTheDocument();
    });
  });
});
