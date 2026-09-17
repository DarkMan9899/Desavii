/**
 * `useListingWizardState` — the shared step/identity state
 * `PartnerListingWizard` and every one of its steps read/write through.
 * The URL is the source of truth for *position* (`?step=`) and
 * *identity* (`?listingId=`), matching `useSearchFilters.js`'s
 * URL-is-truth precedent: a partner can refresh mid-wizard, share the
 * URL, or use Back/Forward, and land exactly where they were — because
 * `createListing` runs on the Basic Information step (not at final
 * submit), `listingId` becomes real and URL-persisted the moment it
 * exists, which is what makes every later step's autosave (a plain
 * `updateListing` PATCH) genuinely resumable rather than local-only
 * wizard state that would vanish on refresh.
 *
 * `completedStepIds` is a UX affordance for `WizardProgress`'s
 * click-back navigation, not a correctness gate — the only real
 * publish-readiness check is server-side (`ListingService.
 * #checkPublishReadiness`, surfaced by `ReviewStep`). A step counts as
 * completed once the wizard has navigated past it in this session, or
 * — resuming a draft via a direct `?listingId=&step=` link — every step
 * before Basic Information's creation point, since reaching that
 * `listingId` at all implies Category and Basic Information already
 * happened.
 *
 * 2026 Partner Workspace redesign (Sprint 3): `authoringLocale` is a
 * third URL-persisted value (`?contentLocale=`), shared by
 * `BasicInfoStep`/`ContentStep` — which listing translation a partner
 * is currently editing. URL-persisted for the same "survives refresh/
 * Back/Forward/a shared link" reason `step`/`listingId` already are,
 * and deliberately its OWN param rather than reusing the route's
 * `:locale` — the workspace's UI language and the content-authoring
 * language are independent choices; switching one must never silently
 * change the other.
 */

import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SUPPORTED_LOCALES } from '../../../../translations/i18n.js';
import { DEFAULT_CONTENT_LOCALE } from '../../utils/getLocalizedItems.js';
import { DEFAULT_PUBLICATION_PERIOD_DAYS } from '../../constants/publicationPeriod.js';
import { WIZARD_STEPS } from './wizardSteps.js';

export function useListingWizardState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [categoryId, setCategoryId] = useState(null);
  // Listing Lifetime / Renewal, Step B3: same "plain useState, not a URL
  // param" choice as `categoryId` above — this only matters on the very
  // last step, right before publish, so it doesn't need to survive a
  // refresh/shared-link the way step position or listing identity do; a
  // reload simply re-defaults to 90, which the brief's own §19 explicitly
  // allows.
  const [publicationPeriodDays, setPublicationPeriodDays] = useState(
    DEFAULT_PUBLICATION_PERIOD_DAYS,
  );

  const listingIdParam = searchParams.get('listingId');
  const listingId = listingIdParam ? Number(listingIdParam) : null;

  // 2026 Partner Workspace redesign (Sprint 3): the CONTENT-authoring
  // locale — deliberately its own URL param (`contentLocale`), never
  // derived from the route's own `:locale` (the workspace's UI
  // language). Defaults to the platform's content default ('en', same
  // as `getLocalizedItems.js`'s `DEFAULT_CONTENT_LOCALE`), not whatever
  // language the partner's dashboard happens to be in — switching UI
  // language must never silently change which translation a partner is
  // editing.
  const authoringLocaleParam = searchParams.get('contentLocale');
  const authoringLocale = SUPPORTED_LOCALES.includes(authoringLocaleParam)
    ? authoringLocaleParam
    : DEFAULT_CONTENT_LOCALE;

  const setAuthoringLocale = useCallback(
    (code) => {
      const next = new URLSearchParams(searchParams);
      next.set('contentLocale', code);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const stepParam = searchParams.get('step');
  const currentStepId = WIZARD_STEPS.some((step) => step.id === stepParam)
    ? stepParam
    : WIZARD_STEPS[0].id;
  const currentStepIndex = WIZARD_STEPS.findIndex(
    (step) => step.id === currentStepId,
  );

  const goToStep = useCallback(
    (stepId, { replace = false } = {}) => {
      const next = new URLSearchParams(searchParams);
      next.set('step', stepId);
      setSearchParams(next, { replace });
    },
    [searchParams, setSearchParams],
  );

  const setListingId = useCallback(
    (id) => {
      const next = new URLSearchParams(searchParams);
      next.set('listingId', String(id));
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  /**
   * `BasicInfoStep`'s creation submit needs to set `listingId` AND advance
   * to the next step in one shot. `setSearchParams` is an imperative
   * `navigate()` call, not a queued state update — two calls issued
   * synchronously (as `setListingId(id); goToNextStep();` would be) both
   * read the same pre-navigation `searchParams` snapshot, so the second
   * call's URL silently drops the first call's change. Combining both
   * writes into a single `setSearchParams` call is the only way to make
   * both land.
   */
  const completeCreationStep = useCallback(
    (id) => {
      const next = new URLSearchParams(searchParams);
      next.set('listingId', String(id));
      const nextStep = WIZARD_STEPS[currentStepIndex + 1];
      if (nextStep) next.set('step', nextStep.id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams, currentStepIndex],
  );

  const goToNextStep = useCallback(() => {
    const next = WIZARD_STEPS[currentStepIndex + 1];
    if (next) goToStep(next.id);
  }, [currentStepIndex, goToStep]);

  const goToPreviousStep = useCallback(() => {
    const previous = WIZARD_STEPS[currentStepIndex - 1];
    if (previous) goToStep(previous.id);
  }, [currentStepIndex, goToStep]);

  const completedStepIds = useMemo(() => {
    const passed = WIZARD_STEPS.slice(0, currentStepIndex).map(
      (step) => step.id,
    );
    if (!listingId) return passed;
    return Array.from(new Set([...passed, 'category', 'basicInfo']));
  }, [currentStepIndex, listingId]);

  return {
    steps: WIZARD_STEPS,
    currentStepId,
    currentStepIndex,
    listingId,
    setListingId,
    completeCreationStep,
    categoryId,
    setCategoryId,
    publicationPeriodDays,
    setPublicationPeriodDays,
    authoringLocale,
    setAuthoringLocale,
    completedStepIds,
    goToStep,
    goToNextStep,
    goToPreviousStep,
    isFirstStep: currentStepIndex === 0,
    isLastStep: currentStepIndex === WIZARD_STEPS.length - 1,
  };
}

export default useListingWizardState;
