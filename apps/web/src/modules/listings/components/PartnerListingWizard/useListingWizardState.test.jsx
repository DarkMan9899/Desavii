import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useListingWizardState } from './useListingWizardState.js';

function Harness() {
  const {
    currentStepId,
    listingId,
    categoryId,
    completedStepIds,
    isFirstStep,
    isLastStep,
    setListingId,
    completeCreationStep,
    setCategoryId,
    goToStep,
    goToNextStep,
    goToPreviousStep,
    authoringLocale,
    setAuthoringLocale,
    publicationPeriodDays,
    setPublicationPeriodDays,
  } = useListingWizardState();

  return (
    <div>
      <p data-testid="step">{currentStepId}</p>
      <p data-testid="listingId">{listingId ?? ''}</p>
      <p data-testid="categoryId">{categoryId ?? ''}</p>
      <p data-testid="completed">{completedStepIds.join(',')}</p>
      <p data-testid="isFirstStep">{String(isFirstStep)}</p>
      <p data-testid="isLastStep">{String(isLastStep)}</p>
      <p data-testid="authoringLocale">{authoringLocale}</p>
      <p data-testid="publicationPeriodDays">{publicationPeriodDays}</p>
      <button type="button" onClick={() => setCategoryId(3)}>
        pick category
      </button>
      <button type="button" onClick={() => setPublicationPeriodDays(30)}>
        pick 30-day period
      </button>
      <button type="button" onClick={() => setListingId(42)}>
        create listing
      </button>
      <button type="button" onClick={() => completeCreationStep(99)}>
        create listing and advance
      </button>
      <button type="button" onClick={goToNextStep}>
        next
      </button>
      <button type="button" onClick={goToPreviousStep}>
        back
      </button>
      <button type="button" onClick={() => goToStep('review')}>
        jump to review
      </button>
      <button type="button" onClick={() => setAuthoringLocale('hy')}>
        author in hy
      </button>
    </div>
  );
}

function renderHarness(initialEntry = '/hy/partner/listings/new') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Harness />
    </MemoryRouter>,
  );
}

describe('useListingWizardState (PartnerListingWizard)', () => {
  test('defaults to the first step with no listing/category yet', () => {
    renderHarness();
    expect(screen.getByTestId('step')).toHaveTextContent('category');
    expect(screen.getByTestId('listingId')).toHaveTextContent('');
    expect(screen.getByTestId('isFirstStep')).toHaveTextContent('true');
  });

  test('an unrecognized ?step= value falls back to the first step', () => {
    renderHarness('/hy/partner/listings/new?step=not-a-real-step');
    expect(screen.getByTestId('step')).toHaveTextContent('category');
  });

  test('goToNextStep advances one step at a time', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'next' }));
    expect(screen.getByTestId('step')).toHaveTextContent('basicInfo');
    await user.click(screen.getByRole('button', { name: 'next' }));
    expect(screen.getByTestId('step')).toHaveTextContent('location');
  });

  test('goToPreviousStep from the first step is a no-op', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'back' }));
    expect(screen.getByTestId('step')).toHaveTextContent('category');
  });

  test('setCategoryId stores the picked category before a listing exists', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'pick category' }));
    expect(screen.getByTestId('categoryId')).toHaveTextContent('3');
  });

  // Step L1 (brief §7) — L0 found a pre-creation page refresh silently
  // lost the just-picked category (plain `useState`). `categoryId` is
  // now URL-persisted (`?categoryId=`) like `listingId`/`step`
  // already are — a fresh render at that same URL (RTL's equivalent of
  // a reload) must read the selection straight back, with no click
  // needed to reproduce it.
  test('categoryId survives a pre-creation refresh via the ?categoryId= URL param', () => {
    renderHarness('/hy/partner/listings/new?categoryId=3');
    expect(screen.getByTestId('categoryId')).toHaveTextContent('3');
  });

  test('setListingId persists the real listing id, making Category and Basic Information completed', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'create listing' }));
    expect(screen.getByTestId('listingId')).toHaveTextContent('42');
    expect(screen.getByTestId('completed')).toHaveTextContent('category');
    expect(screen.getByTestId('completed')).toHaveTextContent('basicInfo');
  });

  test('completeCreationStep sets listingId and advances to the next step in one update', async () => {
    const user = userEvent.setup();
    renderHarness('/hy/partner/listings/new?step=basicInfo');
    await user.click(
      screen.getByRole('button', { name: 'create listing and advance' }),
    );
    expect(screen.getByTestId('listingId')).toHaveTextContent('99');
    expect(screen.getByTestId('step')).toHaveTextContent('location');
  });

  test('resuming a draft deep-linked at a later step (?listingId=&step=) marks earlier steps completed', () => {
    renderHarness('/hy/partner/listings/new?listingId=7&step=pricing');
    expect(screen.getByTestId('step')).toHaveTextContent('pricing');
    const completed = screen.getByTestId('completed').textContent.split(',');
    expect(completed).toEqual(
      expect.arrayContaining([
        'category',
        'basicInfo',
        'location',
        'attributes',
        'amenities',
        'media',
      ]),
    );
  });

  test('goToStep jumps directly to a given step', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'jump to review' }));
    expect(screen.getByTestId('step')).toHaveTextContent('review');
    expect(screen.getByTestId('isLastStep')).toHaveTextContent('true');
  });

  // 2026 Partner Workspace redesign (Sprint 3).
  test('authoringLocale defaults to the platform content default (en), not the route UI locale', () => {
    renderHarness('/hy/partner/listings/new');
    expect(screen.getByTestId('authoringLocale')).toHaveTextContent('en');
  });

  test('setAuthoringLocale updates it and persists across a step navigation', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'author in hy' }));
    expect(screen.getByTestId('authoringLocale')).toHaveTextContent('hy');
    await user.click(screen.getByRole('button', { name: 'next' }));
    expect(screen.getByTestId('step')).toHaveTextContent('basicInfo');
    expect(screen.getByTestId('authoringLocale')).toHaveTextContent('hy');
  });

  test('an unrecognized ?contentLocale= value falls back to the platform default', () => {
    renderHarness('/hy/partner/listings/new?contentLocale=fr');
    expect(screen.getByTestId('authoringLocale')).toHaveTextContent('en');
  });

  // Listing Lifetime / Renewal, Step B3.
  test('publicationPeriodDays defaults to 90 for a listing entering its first publication cycle', () => {
    renderHarness();
    expect(screen.getByTestId('publicationPeriodDays')).toHaveTextContent('90');
  });

  test('setPublicationPeriodDays updates it and persists across a step navigation, like authoringLocale', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(
      screen.getByRole('button', { name: 'pick 30-day period' }),
    );
    expect(screen.getByTestId('publicationPeriodDays')).toHaveTextContent('30');
    await user.click(screen.getByRole('button', { name: 'next' }));
    expect(screen.getByTestId('step')).toHaveTextContent('basicInfo');
    expect(screen.getByTestId('publicationPeriodDays')).toHaveTextContent('30');
  });
});
