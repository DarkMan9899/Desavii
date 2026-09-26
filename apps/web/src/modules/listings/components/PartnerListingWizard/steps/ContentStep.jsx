/**
 * ContentStep — step 10 (Phase 18.10). Editors for the four Phase 18
 * rich-content collections a listing can carry: Highlights, Itinerary,
 * Included/Not-included items, and FAQs.
 *
 * 2026 Partner Workspace redesign (Sprint 3): every collection is now
 * `{ hy: [...], ru: [...], en: [...] }`, not one implicit-locale array
 * — `getLocalizedItemsExact` (not the fallback-carrying
 * `getLocalizedItems`) seeds each locale's rows from exactly what's
 * persisted for it, nothing borrowed from another locale. All four
 * locale-scoped maps are lifted above `AuthoringLocaleTabs`, same
 * reasoning as `BasicInfoStep`: switching authoring locale must never
 * discard an unsaved edit in another locale. `handleContinue` sends
 * `languageCode: authoringLocale` to each of the four full-replace
 * endpoints, saving only the locale currently being edited — never all
 * three, never a silent default.
 *
 * `listingId` always exists by the time this step renders
 * (`PartnerListingWizard.jsx` only mounts it once `listing` is loaded),
 * unlike `BasicInfoStep` — so there's no "before creation" branch here,
 * and the standalone "Save {locale} content" action is always
 * available, not conditionally hidden.
 */

import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Button } from '@desavii/ui/components/primitives';
import {
  Input,
  Textarea,
  Select,
  Switch,
} from '@desavii/ui/components/form-controls';
import { Stack, Inline } from '@desavii/ui/components/layout';
import { useToast } from '../../../../../contexts/ToastContext.jsx';
import { useReplaceListingHighlightsMutation } from '../../../mutations/useReplaceListingHighlightsMutation.js';
import { useReplaceListingItineraryMutation } from '../../../mutations/useReplaceListingItineraryMutation.js';
import { useReplaceListingIncludedItemsMutation } from '../../../mutations/useReplaceListingIncludedItemsMutation.js';
import { useReplaceListingFaqsMutation } from '../../../mutations/useReplaceListingFaqsMutation.js';
import { HIGHLIGHT_ICON_CODES } from '../../../utils/highlightIcons.js';
import { getLocalizedItemsExact } from '../../../utils/getLocalizedItems.js';
import { SUPPORTED_LOCALES } from '../../../../../translations/i18n.js';
import AuthoringLocaleTabs from '../AuthoringLocaleTabs/AuthoringLocaleTabs.jsx';
import WizardStepActions from '../WizardStepActions.jsx';
import ApiErrorAlert from '../../../../../components/ApiErrorAlert/ApiErrorAlert.jsx';
import { parseApiError } from '../../../../../utils/apiErrorFeedback.js';
import {
  HIGHLIGHT_TEXT_MAX_LENGTH,
  ITINERARY_TITLE_MAX_LENGTH,
  ITINERARY_DESCRIPTION_MAX_LENGTH,
  INCLUDED_ITEM_TEXT_MAX_LENGTH,
  FAQ_QUESTION_MAX_LENGTH,
  FAQ_ANSWER_MAX_LENGTH,
} from '../../../constants/textLimits.js';
import styles from './ContentStep.module.scss';

// Server issue paths (`highlights.2.text`, `steps.0.title`, ...) index
// only the non-blank rows that were sent, so they can't be mapped back to
// a displayed row — the summary names the section instead.
const SECTION_TITLE_KEY_BY_ISSUE_ROOT = {
  highlights: 'partner.listingWizard.content.highlightsTitle',
  steps: 'partner.listingWizard.content.itineraryTitle',
  items: 'partner.listingWizard.content.includedTitle',
  faqs: 'partner.listingWizard.content.faqsTitle',
};

// listingValidators.js itinerary durationMinutes: int, 1..1440.
const STEP_DURATION_MIN = 1;
const STEP_DURATION_MAX = 1440;

const HIGHLIGHT_MAX = 12;
const ITINERARY_MAX = 30;
const INCLUDED_MAX = 40;
const FAQ_MAX = 20;

function buildRowsByLocale(items, mapRow, nextKey) {
  const rowsByLocale = {};
  SUPPORTED_LOCALES.forEach((code) => {
    rowsByLocale[code] = getLocalizedItemsExact(items, code).map((row) =>
      mapRow(row, nextKey),
    );
  });
  return rowsByLocale;
}

function addRow(setRowsByLocale, locale, blankRow, max, nextKey) {
  setRowsByLocale((current) => {
    if (current[locale].length >= max) return current;
    return {
      ...current,
      [locale]: [...current[locale], { rowKey: nextKey(), ...blankRow }],
    };
  });
}

function updateRow(setRowsByLocale, locale, key, field, value) {
  setRowsByLocale((current) => ({
    ...current,
    [locale]: current[locale].map((row) =>
      row.rowKey === key ? { ...row, [field]: value } : row,
    ),
  }));
}

function removeRow(setRowsByLocale, locale, key) {
  setRowsByLocale((current) => ({
    ...current,
    [locale]: current[locale].filter((row) => row.rowKey !== key),
  }));
}

export default function ContentStep({
  listingId,
  initialHighlights = [],
  initialItinerarySteps = [],
  initialIncludedItems = [],
  initialFaqs = [],
  authoringLocale,
  onAuthoringLocaleChange,
  onBack = undefined,
  onNext,
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const replaceHighlights = useReplaceListingHighlightsMutation();
  const replaceItinerary = useReplaceListingItineraryMutation();
  const replaceIncludedItems = useReplaceListingIncludedItemsMutation();
  const replaceFaqs = useReplaceListingFaqsMutation();

  const nextKeyRef = useRef(0);
  function nextKey() {
    nextKeyRef.current += 1;
    return nextKeyRef.current;
  }

  const [highlightsByLocale, setHighlightsByLocale] = useState(() =>
    buildRowsByLocale(
      initialHighlights,
      (row, key) => ({
        rowKey: key(),
        iconCode: row.icon_code,
        text: row.text,
      }),
      nextKey,
    ),
  );
  const [itineraryByLocale, setItineraryByLocale] = useState(() =>
    buildRowsByLocale(
      initialItinerarySteps,
      (row, key) => ({
        rowKey: key(),
        title: row.title,
        description: row.description ?? '',
        durationMinutes:
          row.duration_minutes === null || row.duration_minutes === undefined
            ? ''
            : String(row.duration_minutes),
      }),
      nextKey,
    ),
  );
  const [includedByLocale, setIncludedByLocale] = useState(() =>
    buildRowsByLocale(
      initialIncludedItems,
      (row, key) => ({
        rowKey: key(),
        itemText: row.item_text,
        isIncluded: row.is_included,
      }),
      nextKey,
    ),
  );
  const [faqsByLocale, setFaqsByLocale] = useState(() =>
    buildRowsByLocale(
      initialFaqs,
      (row, key) => ({
        rowKey: key(),
        question: row.question,
        answer: row.answer,
      }),
      nextKey,
    ),
  );
  const [faqErrors, setFaqErrors] = useState({});

  const highlights = highlightsByLocale[authoringLocale];
  const itinerarySteps = itineraryByLocale[authoringLocale];
  const includedItems = includedByLocale[authoringLocale];
  const faqs = faqsByLocale[authoringLocale];

  const completionByLocale = SUPPORTED_LOCALES.reduce((acc, code) => {
    acc[code] =
      highlightsByLocale[code].length > 0 ||
      itineraryByLocale[code].length > 0 ||
      includedByLocale[code].length > 0 ||
      faqsByLocale[code].length > 0;
    return acc;
  }, {});

  const iconOptions = HIGHLIGHT_ICON_CODES.map((code) => ({
    value: code,
    label: t(`partner.listingWizard.content.highlightIcons.${code}`, {
      defaultValue: code,
    }),
  }));

  function validFaqsOrNull() {
    const nextFaqErrors = {};
    const validFaqs = [];
    faqs.forEach((row) => {
      const hasQuestion = row.question.trim().length > 0;
      const hasAnswer = row.answer.trim().length > 0;
      if (!hasQuestion && !hasAnswer) return;
      if (!hasQuestion || !hasAnswer) {
        nextFaqErrors[row.rowKey] = t(
          'partner.listingWizard.validation.required',
        );
        return;
      }
      validFaqs.push({
        question: row.question.trim(),
        answer: row.answer.trim(),
      });
    });
    setFaqErrors(nextFaqErrors);
    if (Object.keys(nextFaqErrors).length > 0) return null;
    return validFaqs;
  }

  async function saveActiveLocale({ advance }) {
    const validHighlights = highlights
      .filter((row) => row.text.trim().length > 0)
      .map((row) => ({ iconCode: row.iconCode, text: row.text.trim() }));

    const validSteps = itinerarySteps
      .filter((row) => row.title.trim().length > 0)
      .map((row) => ({
        title: row.title.trim(),
        description: row.description.trim() || undefined,
        durationMinutes: row.durationMinutes
          ? Number(row.durationMinutes)
          : undefined,
      }));

    const validIncludedItems = includedItems
      .filter((row) => row.itemText.trim().length > 0)
      .map((row) => ({
        itemText: row.itemText.trim(),
        isIncluded: row.isIncluded,
      }));

    const validFaqs = validFaqsOrNull();
    if (validFaqs === null) return;

    try {
      await Promise.all([
        replaceHighlights.mutateAsync({
          id: listingId,
          highlights: validHighlights,
          languageCode: authoringLocale,
        }),
        replaceItinerary.mutateAsync({
          id: listingId,
          steps: validSteps,
          languageCode: authoringLocale,
        }),
        replaceIncludedItems.mutateAsync({
          id: listingId,
          items: validIncludedItems,
          languageCode: authoringLocale,
        }),
        replaceFaqs.mutateAsync({
          id: listingId,
          faqs: validFaqs,
          languageCode: authoringLocale,
        }),
      ]);
    } catch {
      // Rendered from the mutations' own `error` (ApiErrorAlert).
      return;
    }

    if (advance) {
      onNext();
    } else {
      showToast(
        t('partner.listingWizard.locale.translationSaved', {
          locale: t(`partner.listingWizard.contentLocale.${authoringLocale}`),
        }),
        { variant: 'success' },
      );
    }
  }

  const isSubmitting =
    replaceHighlights.isPending ||
    replaceItinerary.isPending ||
    replaceIncludedItems.isPending ||
    replaceFaqs.isPending;
  const mutationError =
    replaceHighlights.error ||
    replaceItinerary.error ||
    replaceIncludedItems.error ||
    replaceFaqs.error;
  const sectionLabels = {};
  (parseApiError(mutationError)?.issues ?? []).forEach(({ path }) => {
    const titleKey = SECTION_TITLE_KEY_BY_ISSUE_ROOT[path.split('.')[0]];
    if (titleKey) sectionLabels[path] = t(titleKey);
  });

  return (
    <div>
      <h2>{t('partner.listingWizard.steps.content')}</h2>
      <p className={styles.intro}>{t('partner.listingWizard.content.intro')}</p>
      <ApiErrorAlert error={mutationError} fieldLabels={sectionLabels} />

      <p className={styles.localeNotice}>
        {t('partner.listingWizard.locale.notice', {
          locale: t(`partner.listingWizard.contentLocale.${authoringLocale}`),
        })}
      </p>

      <AuthoringLocaleTabs
        activeLocale={authoringLocale}
        onChange={onAuthoringLocaleChange}
        completionByLocale={completionByLocale}
        ariaLabel={t('partner.listingWizard.locale.switcherLabel')}
      >
        <Stack gap="8">
          <section>
            <h3>{t('partner.listingWizard.content.highlightsTitle')}</h3>
            <p className={styles.sectionHint}>
              {t('partner.listingWizard.content.highlightsHint')}
            </p>
            <Stack gap="3">
              {highlights.map((row) => (
                <div key={row.rowKey} className={styles.row}>
                  <Select
                    size="sm"
                    ariaLabel={t('partner.listingWizard.content.iconLabel')}
                    options={iconOptions}
                    value={row.iconCode}
                    onChange={(value) =>
                      updateRow(
                        setHighlightsByLocale,
                        authoringLocale,
                        row.rowKey,
                        'iconCode',
                        value,
                      )
                    }
                  />
                  <Input
                    size="sm"
                    label={t(
                      'partner.listingWizard.content.highlightTextLabel',
                    )}
                    value={row.text}
                    maxLength={HIGHLIGHT_TEXT_MAX_LENGTH}
                    onChange={(event) =>
                      updateRow(
                        setHighlightsByLocale,
                        authoringLocale,
                        row.rowKey,
                        'text',
                        event.target.value,
                      )
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      removeRow(
                        setHighlightsByLocale,
                        authoringLocale,
                        row.rowKey,
                      )
                    }
                  >
                    {t('partner.listingWizard.content.removeRow')}
                  </Button>
                </div>
              ))}
            </Stack>
            <Button
              size="sm"
              variant="secondary"
              disabled={highlights.length >= HIGHLIGHT_MAX}
              onClick={() =>
                addRow(
                  setHighlightsByLocale,
                  authoringLocale,
                  { iconCode: HIGHLIGHT_ICON_CODES[0], text: '' },
                  HIGHLIGHT_MAX,
                  nextKey,
                )
              }
            >
              {t('partner.listingWizard.content.addHighlight')}
            </Button>
          </section>

          <section>
            <h3>{t('partner.listingWizard.content.itineraryTitle')}</h3>
            <p className={styles.sectionHint}>
              {t('partner.listingWizard.content.itineraryHint')}
            </p>
            <Stack gap="4">
              {itinerarySteps.map((row, index) => (
                <div key={row.rowKey} className={styles.stepCard}>
                  <div className={styles.stepCardHeader}>
                    <span className={styles.stepNumber}>{index + 1}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        removeRow(
                          setItineraryByLocale,
                          authoringLocale,
                          row.rowKey,
                        )
                      }
                    >
                      {t('partner.listingWizard.content.removeRow')}
                    </Button>
                  </div>
                  <Input
                    size="sm"
                    label={t('partner.listingWizard.content.stepTitleLabel')}
                    value={row.title}
                    maxLength={ITINERARY_TITLE_MAX_LENGTH}
                    onChange={(event) =>
                      updateRow(
                        setItineraryByLocale,
                        authoringLocale,
                        row.rowKey,
                        'title',
                        event.target.value,
                      )
                    }
                  />
                  <Textarea
                    size="sm"
                    label={t(
                      'partner.listingWizard.content.stepDescriptionLabel',
                    )}
                    value={row.description}
                    maxLength={ITINERARY_DESCRIPTION_MAX_LENGTH}
                    onChange={(event) =>
                      updateRow(
                        setItineraryByLocale,
                        authoringLocale,
                        row.rowKey,
                        'description',
                        event.target.value,
                      )
                    }
                  />
                  <Input
                    type="number"
                    size="sm"
                    label={t('partner.listingWizard.content.stepDurationLabel')}
                    value={row.durationMinutes}
                    min={STEP_DURATION_MIN}
                    max={STEP_DURATION_MAX}
                    step={1}
                    onChange={(event) =>
                      updateRow(
                        setItineraryByLocale,
                        authoringLocale,
                        row.rowKey,
                        'durationMinutes',
                        event.target.value,
                      )
                    }
                  />
                </div>
              ))}
            </Stack>
            <Button
              size="sm"
              variant="secondary"
              disabled={itinerarySteps.length >= ITINERARY_MAX}
              onClick={() =>
                addRow(
                  setItineraryByLocale,
                  authoringLocale,
                  { title: '', description: '', durationMinutes: '' },
                  ITINERARY_MAX,
                  nextKey,
                )
              }
            >
              {t('partner.listingWizard.content.addStep')}
            </Button>
          </section>

          <section>
            <h3>{t('partner.listingWizard.content.includedTitle')}</h3>
            <p className={styles.sectionHint}>
              {t('partner.listingWizard.content.includedHint')}
            </p>
            <Stack gap="3">
              {includedItems.map((row) => (
                <div key={row.rowKey} className={styles.row}>
                  <Switch
                    checked={row.isIncluded}
                    onChange={(event) =>
                      updateRow(
                        setIncludedByLocale,
                        authoringLocale,
                        row.rowKey,
                        'isIncluded',
                        event.target.checked,
                      )
                    }
                    label={t(
                      row.isIncluded
                        ? 'partner.listingWizard.content.included'
                        : 'partner.listingWizard.content.notIncluded',
                    )}
                  />
                  <Input
                    size="sm"
                    label={t('partner.listingWizard.content.itemTextLabel')}
                    value={row.itemText}
                    maxLength={INCLUDED_ITEM_TEXT_MAX_LENGTH}
                    onChange={(event) =>
                      updateRow(
                        setIncludedByLocale,
                        authoringLocale,
                        row.rowKey,
                        'itemText',
                        event.target.value,
                      )
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      removeRow(
                        setIncludedByLocale,
                        authoringLocale,
                        row.rowKey,
                      )
                    }
                  >
                    {t('partner.listingWizard.content.removeRow')}
                  </Button>
                </div>
              ))}
            </Stack>
            <Button
              size="sm"
              variant="secondary"
              disabled={includedItems.length >= INCLUDED_MAX}
              onClick={() =>
                addRow(
                  setIncludedByLocale,
                  authoringLocale,
                  { itemText: '', isIncluded: true },
                  INCLUDED_MAX,
                  nextKey,
                )
              }
            >
              {t('partner.listingWizard.content.addItem')}
            </Button>
          </section>

          <section>
            <h3>{t('partner.listingWizard.content.faqsTitle')}</h3>
            <p className={styles.sectionHint}>
              {t('partner.listingWizard.content.faqsHint')}
            </p>
            <Stack gap="4">
              {faqs.map((row) => (
                <div key={row.rowKey} className={styles.stepCard}>
                  <div className={styles.stepCardHeader}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        removeRow(setFaqsByLocale, authoringLocale, row.rowKey)
                      }
                    >
                      {t('partner.listingWizard.content.removeRow')}
                    </Button>
                  </div>
                  <Input
                    size="sm"
                    label={t('partner.listingWizard.content.questionLabel')}
                    value={row.question}
                    maxLength={FAQ_QUESTION_MAX_LENGTH}
                    error={faqErrors[row.rowKey]}
                    onChange={(event) =>
                      updateRow(
                        setFaqsByLocale,
                        authoringLocale,
                        row.rowKey,
                        'question',
                        event.target.value,
                      )
                    }
                  />
                  <Textarea
                    size="sm"
                    label={t('partner.listingWizard.content.answerLabel')}
                    value={row.answer}
                    maxLength={FAQ_ANSWER_MAX_LENGTH}
                    onChange={(event) =>
                      updateRow(
                        setFaqsByLocale,
                        authoringLocale,
                        row.rowKey,
                        'answer',
                        event.target.value,
                      )
                    }
                  />
                </div>
              ))}
            </Stack>
            <Button
              size="sm"
              variant="secondary"
              disabled={faqs.length >= FAQ_MAX}
              onClick={() =>
                addRow(
                  setFaqsByLocale,
                  authoringLocale,
                  { question: '', answer: '' },
                  FAQ_MAX,
                  nextKey,
                )
              }
            >
              {t('partner.listingWizard.content.addFaq')}
            </Button>
          </section>
        </Stack>
      </AuthoringLocaleTabs>

      <Inline justify="flex-end">
        <Button
          variant="secondary"
          loading={isSubmitting}
          onClick={() => saveActiveLocale({ advance: false })}
        >
          {t('partner.listingWizard.locale.saveTranslation', {
            locale: t(`partner.listingWizard.contentLocale.${authoringLocale}`),
          })}
        </Button>
      </Inline>

      <WizardStepActions
        onBack={onBack}
        onContinue={() => saveActiveLocale({ advance: true })}
        isSubmitting={isSubmitting}
        backLabel={t('partner.listingWizard.back')}
        continueLabel={t('partner.listingWizard.continue')}
      />
    </div>
  );
}

const highlightShape = PropTypes.shape({
  language_code: PropTypes.string.isRequired,
  icon_code: PropTypes.string.isRequired,
  text: PropTypes.string.isRequired,
});

const itineraryStepShape = PropTypes.shape({
  language_code: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  duration_minutes: PropTypes.number,
});

const includedItemShape = PropTypes.shape({
  language_code: PropTypes.string.isRequired,
  item_text: PropTypes.string.isRequired,
  is_included: PropTypes.bool.isRequired,
});

const faqShape = PropTypes.shape({
  language_code: PropTypes.string.isRequired,
  question: PropTypes.string.isRequired,
  answer: PropTypes.string.isRequired,
});

ContentStep.propTypes = {
  listingId: PropTypes.number.isRequired,
  initialHighlights: PropTypes.arrayOf(highlightShape),
  initialItinerarySteps: PropTypes.arrayOf(itineraryStepShape),
  initialIncludedItems: PropTypes.arrayOf(includedItemShape),
  initialFaqs: PropTypes.arrayOf(faqShape),
  authoringLocale: PropTypes.oneOf(SUPPORTED_LOCALES).isRequired,
  onAuthoringLocaleChange: PropTypes.func.isRequired,
  onBack: PropTypes.func,
  onNext: PropTypes.func.isRequired,
};
