import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import PropTypes from 'prop-types';
import ToastProvider from '../../../../../providers/ToastProvider.jsx';
import ContentStep from './ContentStep.jsx';
import { useReplaceListingHighlightsMutation } from '../../../mutations/useReplaceListingHighlightsMutation.js';
import { useReplaceListingItineraryMutation } from '../../../mutations/useReplaceListingItineraryMutation.js';
import { useReplaceListingIncludedItemsMutation } from '../../../mutations/useReplaceListingIncludedItemsMutation.js';
import { useReplaceListingFaqsMutation } from '../../../mutations/useReplaceListingFaqsMutation.js';

vi.mock('../../../mutations/useReplaceListingHighlightsMutation.js', () => ({
  useReplaceListingHighlightsMutation: vi.fn(),
}));
vi.mock('../../../mutations/useReplaceListingItineraryMutation.js', () => ({
  useReplaceListingItineraryMutation: vi.fn(),
}));
vi.mock('../../../mutations/useReplaceListingIncludedItemsMutation.js', () => ({
  useReplaceListingIncludedItemsMutation: vi.fn(),
}));
vi.mock('../../../mutations/useReplaceListingFaqsMutation.js', () => ({
  useReplaceListingFaqsMutation: vi.fn(),
}));

// This project's test setup defaults i18next to Armenian (hy) — mirrors
// the exact locale-string convention every other wizard-step test file
// (e.g. MediaStep.test.jsx) already uses, rather than English.
const ADD_HIGHLIGHT = 'Ավելացնել առանձնահատկություն';
const REMOVE_ROW = 'Հեռացնել';
const ADD_FAQ = 'Ավելացնել հարց';
const QUESTION_LABEL = 'Հարց';
const CONTINUE = 'Շարունակել';
const REQUIRED_ERROR = 'Այս դաշտը պարտադիր է։';

// One locale's worth of real, persisted content per collection — same
// shape `GET /listings/:id` returns (flat arrays across all locales,
// each row tagged `language_code`), which is what `PartnerListingWizard`
// now passes straight through unfiltered.
const EN_HIGHLIGHTS = [
  { language_code: 'en', icon_code: 'wifi', text: 'Free Wi-Fi throughout' },
];
const EN_STEPS = [
  {
    language_code: 'en',
    title: 'Pickup',
    description: 'Hotel pickup',
    duration_minutes: 30,
  },
];
const EN_INCLUDED = [
  { language_code: 'en', item_text: 'Breakfast', is_included: true },
];
const EN_FAQS = [
  {
    language_code: 'en',
    question: 'Is parking free?',
    answer: 'Yes, on-site.',
  },
];

// A real Wizard lifts `authoringLocale` — this harness mirrors that
// contract instead of hardcoding a fixed prop.
function Harness({
  startLocale = 'en',
  initialHighlights = [],
  initialItinerarySteps = [],
  initialIncludedItems = [],
  initialFaqs = [],
  showItinerary = true,
  onNext = vi.fn(),
}) {
  const [authoringLocale, setAuthoringLocale] = useState(startLocale);
  return (
    <ContentStep
      listingId={7}
      initialHighlights={initialHighlights}
      initialItinerarySteps={initialItinerarySteps}
      initialIncludedItems={initialIncludedItems}
      initialFaqs={initialFaqs}
      showItinerary={showItinerary}
      onNext={onNext}
      authoringLocale={authoringLocale}
      onAuthoringLocaleChange={setAuthoringLocale}
    />
  );
}

Harness.propTypes = {
  startLocale: PropTypes.string,
  // eslint-disable-next-line react/forbid-prop-types -- test harness passthrough
  initialHighlights: PropTypes.array,
  // eslint-disable-next-line react/forbid-prop-types -- test harness passthrough
  initialItinerarySteps: PropTypes.array,
  // eslint-disable-next-line react/forbid-prop-types -- test harness passthrough
  initialIncludedItems: PropTypes.array,
  // eslint-disable-next-line react/forbid-prop-types -- test harness passthrough
  initialFaqs: PropTypes.array,
  showItinerary: PropTypes.bool,
  onNext: PropTypes.func,
};

function renderStep({
  startLocale = 'en',
  initialHighlights = [],
  initialItinerarySteps = [],
  initialIncludedItems = [],
  initialFaqs = [],
  showItinerary = true,
  onNext = vi.fn(),
} = {}) {
  return render(
    <ToastProvider>
      <Harness
        startLocale={startLocale}
        initialHighlights={initialHighlights}
        initialItinerarySteps={initialItinerarySteps}
        initialIncludedItems={initialIncludedItems}
        initialFaqs={initialFaqs}
        showItinerary={showItinerary}
        onNext={onNext}
      />
    </ToastProvider>,
  );
}

describe('ContentStep (PartnerListingWizard)', () => {
  let highlightsMutateAsync;
  let itineraryMutateAsync;
  let includedItemsMutateAsync;
  let faqsMutateAsync;

  beforeEach(() => {
    highlightsMutateAsync = vi.fn().mockResolvedValue({ data: {} });
    itineraryMutateAsync = vi.fn().mockResolvedValue({ data: {} });
    includedItemsMutateAsync = vi.fn().mockResolvedValue({ data: {} });
    faqsMutateAsync = vi.fn().mockResolvedValue({ data: {} });

    useReplaceListingHighlightsMutation.mockReturnValue({
      mutateAsync: highlightsMutateAsync,
      isPending: false,
      error: null,
    });
    useReplaceListingItineraryMutation.mockReturnValue({
      mutateAsync: itineraryMutateAsync,
      isPending: false,
      error: null,
    });
    useReplaceListingIncludedItemsMutation.mockReturnValue({
      mutateAsync: includedItemsMutateAsync,
      isPending: false,
      error: null,
    });
    useReplaceListingFaqsMutation.mockReturnValue({
      mutateAsync: faqsMutateAsync,
      isPending: false,
      error: null,
    });
  });

  test('renders existing highlights/itinerary/included items/faqs for the active locale', () => {
    renderStep({
      initialHighlights: EN_HIGHLIGHTS,
      initialItinerarySteps: EN_STEPS,
      initialIncludedItems: EN_INCLUDED,
      initialFaqs: EN_FAQS,
    });
    expect(
      screen.getByDisplayValue('Free Wi-Fi throughout'),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('Pickup')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Breakfast')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Is parking free?')).toBeInTheDocument();
  });

  test('adding a highlight row then removing it changes the row count without erroring', async () => {
    const user = userEvent.setup();
    renderStep({ initialHighlights: EN_HIGHLIGHTS });
    await user.click(screen.getByRole('button', { name: ADD_HIGHLIGHT }));
    const removeButtons = screen.getAllByRole('button', { name: REMOVE_ROW });
    expect(removeButtons.length).toBeGreaterThan(1);
    await user.click(removeButtons[removeButtons.length - 1]);
    expect(
      screen.getAllByRole('button', { name: REMOVE_ROW }).length,
    ).toBeLessThan(removeButtons.length);
  });

  test('Continue sends the full replace payload (tagged with the active languageCode) for all four collections and calls onNext', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    renderStep({
      initialHighlights: EN_HIGHLIGHTS,
      initialItinerarySteps: EN_STEPS,
      initialIncludedItems: EN_INCLUDED,
      initialFaqs: EN_FAQS,
      onNext,
    });

    await user.click(screen.getByRole('button', { name: CONTINUE }));

    expect(highlightsMutateAsync).toHaveBeenCalledWith({
      id: 7,
      highlights: [{ iconCode: 'wifi', text: 'Free Wi-Fi throughout' }],
      languageCode: 'en',
    });
    expect(itineraryMutateAsync).toHaveBeenCalledWith({
      id: 7,
      steps: [
        { title: 'Pickup', description: 'Hotel pickup', durationMinutes: 30 },
      ],
      languageCode: 'en',
    });
    expect(includedItemsMutateAsync).toHaveBeenCalledWith({
      id: 7,
      items: [{ itemText: 'Breakfast', isIncluded: true }],
      languageCode: 'en',
    });
    expect(faqsMutateAsync).toHaveBeenCalledWith({
      id: 7,
      faqs: [{ question: 'Is parking free?', answer: 'Yes, on-site.' }],
      languageCode: 'en',
    });
    expect(onNext).toHaveBeenCalled();
  });

  // Wizard rebuild (field-gap X4): an itinerary belongs to tours and
  // attractions only — a stay, a restaurant or a car never shows or saves one.
  test('without an itinerary the step neither renders nor replaces one', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    renderStep({
      initialHighlights: EN_HIGHLIGHTS,
      initialItinerarySteps: EN_STEPS,
      showItinerary: false,
      onNext,
    });

    expect(screen.queryByDisplayValue('Pickup')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: CONTINUE }));

    expect(highlightsMutateAsync).toHaveBeenCalled();
    expect(itineraryMutateAsync).not.toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
  });

  test('a blank added row is silently dropped from the payload on Continue', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    renderStep({ initialHighlights: EN_HIGHLIGHTS, onNext });

    await user.click(screen.getByRole('button', { name: ADD_HIGHLIGHT }));
    await user.click(screen.getByRole('button', { name: CONTINUE }));

    expect(highlightsMutateAsync).toHaveBeenCalledWith({
      id: 7,
      highlights: [{ iconCode: 'wifi', text: 'Free Wi-Fi throughout' }],
      languageCode: 'en',
    });
    expect(onNext).toHaveBeenCalled();
  });

  test('a FAQ row with only a question filled in blocks Continue with an inline error', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    renderStep({ initialFaqs: EN_FAQS, onNext });

    await user.click(screen.getByRole('button', { name: ADD_FAQ }));
    const questionInputs = screen.getAllByLabelText(QUESTION_LABEL);
    await user.type(
      questionInputs[questionInputs.length - 1],
      'Any pets allowed?',
    );
    await user.click(screen.getByRole('button', { name: CONTINUE }));

    expect(screen.getByText(REQUIRED_ERROR)).toBeInTheDocument();
    expect(onNext).not.toHaveBeenCalled();
    expect(faqsMutateAsync).not.toHaveBeenCalled();
  });

  test('starts with empty collections when nothing is persisted for any locale', () => {
    renderStep({});
    expect(
      screen.queryByDisplayValue('Free Wi-Fi throughout'),
    ).not.toBeInTheDocument();
  });

  // 2026 Partner Workspace redesign (Sprint 3) — the core new guarantees.
  describe('multilingual authoring', () => {
    test('each locale shows only its own persisted content, never another locale as a fallback', () => {
      renderStep({ initialHighlights: EN_HIGHLIGHTS, startLocale: 'hy' });
      // hy has no persisted highlight row — must be genuinely empty, not
      // the English one standing in for it.
      expect(
        screen.queryByDisplayValue('Free Wi-Fi throughout'),
      ).not.toBeInTheDocument();
    });

    test('switching authoring locale preserves an unsaved edit', async () => {
      const user = userEvent.setup();
      renderStep({});

      await user.click(screen.getByRole('button', { name: ADD_HIGHLIGHT }));
      const highlightTextInputs = screen.getAllByLabelText(
        'Առանձնահատկության տեքստ',
      );
      await user.type(
        highlightTextInputs[highlightTextInputs.length - 1],
        'Rooftop pool',
      );

      await user.click(screen.getByRole('tab', { name: /Հայերեն/ }));
      expect(
        screen.queryByDisplayValue('Rooftop pool'),
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole('tab', { name: /English/ }));
      expect(screen.getByDisplayValue('Rooftop pool')).toBeInTheDocument();
    });

    test('the standalone "Save translation" button saves only the active locale without advancing', async () => {
      const user = userEvent.setup();
      const onNext = vi.fn();
      renderStep({ startLocale: 'hy', onNext });

      await user.click(screen.getByRole('button', { name: ADD_FAQ }));
      const questionInputs = screen.getAllByLabelText(QUESTION_LABEL);
      await user.type(questionInputs[0], 'Ավտոկայանատեղի կա՞');
      const answerInputs = screen.getAllByLabelText('Պատասխան');
      await user.type(answerInputs[0], 'Այո, անվճար։');

      await user.click(
        screen.getByRole('button', {
          name: /Պահպանել Հայերեն թարգմանությունը/,
        }),
      );

      expect(faqsMutateAsync).toHaveBeenCalledWith({
        id: 7,
        faqs: [{ question: 'Ավտոկայանատեղի կա՞', answer: 'Այո, անվճար։' }],
        languageCode: 'hy',
      });
      expect(onNext).not.toHaveBeenCalled();
    });

    test('the locale tabs show a completion mark only for locales with any real content', () => {
      renderStep({ initialFaqs: EN_FAQS });
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
