import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ListingPoliciesSection from './ListingPoliciesSection.jsx';

describe('ListingPoliciesSection (Listing Details)', () => {
  test('renders nothing when the category has no policies', () => {
    const { container } = render(
      <ListingPoliciesSection policies={[]} listing={{ policy_values: [] }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when none of the policies have a listing value', () => {
    const { container } = render(
      <ListingPoliciesSection
        policies={[{ code: 'pets_allowed', data_type: 'BOOLEAN' }]}
        listing={{ policy_values: [] }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('a BOOLEAN policy reads as a short title with allowed / not allowed', () => {
    render(
      <ListingPoliciesSection
        policies={[
          { code: 'pets_allowed', data_type: 'BOOLEAN' },
          { code: 'smoking_allowed', data_type: 'BOOLEAN' },
        ]}
        listing={{
          policy_values: [
            { code: 'pets_allowed', value: 'true' },
            { code: 'smoking_allowed', value: 'false' },
          ],
        }}
        sectionId="policies"
      />,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Կանոններ' }),
    ).toHaveAttribute('id', 'policies');
    expect(screen.getByText('Ընտանի կենդանիներ')).toBeInTheDocument();
    expect(screen.getByText('Թույլատրվում է')).toBeInTheDocument();
    expect(screen.getByText('Ծխել')).toBeInTheDocument();
    expect(screen.getByText('Չի թույլատրվում')).toBeInTheDocument();
  });

  test('renders a STRING policy plainly', () => {
    render(
      <ListingPoliciesSection
        policies={[{ code: 'check_in_time', data_type: 'STRING' }]}
        listing={{ policy_values: [{ code: 'check_in_time', value: '14:00' }] }}
      />,
    );
    expect(screen.getByText('Մուտք')).toBeInTheDocument();
    expect(screen.getByText('14:00')).toBeInTheDocument();
  });

  test('policies follow the guest reading order: check-in, check-out, then house rules', () => {
    render(
      <ListingPoliciesSection
        policies={[
          { code: 'pets_allowed', data_type: 'BOOLEAN' },
          { code: 'check_out_time', data_type: 'STRING' },
          { code: 'check_in_time', data_type: 'STRING' },
        ]}
        listing={{
          policy_values: [
            { code: 'pets_allowed', value: 'true' },
            { code: 'check_out_time', value: '12:00' },
            { code: 'check_in_time', value: '14:00' },
          ],
        }}
      />,
    );
    const titles = screen
      .getAllByText(/^(Մուտք|Ելք|Ընտանի կենդանիներ)$/)
      .map((node) => node.textContent);
    expect(titles).toEqual(['Մուտք', 'Ելք', 'Ընտանի կենդանիներ']);
  });

  // P2.1 integrity check: a bare "Flexible"/"Moderate"/"Strict" label
  // could read as an automatically-enforced refund promise, which the
  // backend does not provide (`cancellationRefundPolicy.js` — every
  // customer-initiated cancellation is reviewed manually regardless of
  // this value). Only this one policy gets the explanation, expandable.
  test('only the cancellation policy carries the expandable refund explanation', () => {
    const { container } = render(
      <ListingPoliciesSection
        policies={[
          {
            code: 'cancellation_policy',
            data_type: 'ENUM',
            options: [{ value: 1, code: 'FLEXIBLE' }],
          },
          { code: 'check_in_time', data_type: 'STRING' },
        ]}
        listing={{
          policy_values: [
            { code: 'cancellation_policy', value: '1' },
            { code: 'check_in_time', value: '14:00' },
          ],
        }}
      />,
    );
    expect(
      screen.getByText(/Վերադարձի հայտերը դիտարկվում են առանձին-առանձին/),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('details')).toHaveLength(1);
    expect(screen.getByText('14:00')).toBeInTheDocument();
  });

  test('uses the category heading when one is given', () => {
    render(
      <ListingPoliciesSection
        policies={[{ code: 'check_in_time', data_type: 'STRING' }]}
        listing={{ policy_values: [{ code: 'check_in_time', value: '14:00' }] }}
        headingKey="pages.listingDetail.policies.headingHouseRules"
      />,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Կացության կանոններ' }),
    ).toBeInTheDocument();
  });
});
