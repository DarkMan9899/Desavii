import { describe, test, expect } from 'vitest';
import {
  PRESENTATION_GROUPS,
  resolvePresentationGroup,
  CATEGORY_VISUAL_KEYS,
  resolveCategoryVisualKey,
  reorderSections,
  resolveBookingCtaKey,
} from './categoryPresentation.js';

describe('categoryPresentation', () => {
  describe('resolvePresentationGroup', () => {
    test('maps HOTEL and PROPERTY to ACCOMMODATION', () => {
      expect(resolvePresentationGroup('HOTEL')).toBe(
        PRESENTATION_GROUPS.ACCOMMODATION,
      );
      expect(resolvePresentationGroup('PROPERTY')).toBe(
        PRESENTATION_GROUPS.ACCOMMODATION,
      );
    });

    test('maps TOUR and ATTRACTION to EXPERIENCE', () => {
      expect(resolvePresentationGroup('TOUR')).toBe(
        PRESENTATION_GROUPS.EXPERIENCE,
      );
      expect(resolvePresentationGroup('ATTRACTION')).toBe(
        PRESENTATION_GROUPS.EXPERIENCE,
      );
    });

    test('maps CAR_RENTAL to TRANSPORT', () => {
      expect(resolvePresentationGroup('CAR_RENTAL')).toBe(
        PRESENTATION_GROUPS.TRANSPORT,
      );
    });

    // Pass 3 remediation: RESTAURANT now maps to its own DINING group (a
    // diner reads the menu right after the description), not the GENERIC
    // fallback.
    test('maps RESTAURANT to DINING', () => {
      expect(resolvePresentationGroup('RESTAURANT')).toBe(
        PRESENTATION_GROUPS.DINING,
      );
    });

    test('falls back to GENERIC for an unmapped or unknown listing type', () => {
      expect(resolvePresentationGroup('SOMETHING_NEW')).toBe(
        PRESENTATION_GROUPS.GENERIC,
      );
      expect(resolvePresentationGroup(undefined)).toBe(
        PRESENTATION_GROUPS.GENERIC,
      );
    });
  });

  describe('reorderSections', () => {
    const allSections = [
      { id: 'about', label: 'About' },
      { id: 'itinerary', label: 'Itinerary' },
      { id: 'included', label: "What's included" },
      { id: 'attributes', label: 'Details' },
      { id: 'amenities', label: 'Amenities' },
      { id: 'policies', label: 'Policies' },
      { id: 'availability', label: 'Availability' },
      { id: 'location', label: 'Location' },
      { id: 'reviews', label: 'Reviews' },
      { id: 'faq', label: 'FAQ' },
    ];

    test('ACCOMMODATION surfaces amenities and policies before attributes/included', () => {
      const present = allSections.filter((s) =>
        ['about', 'amenities', 'policies', 'included', 'attributes'].includes(
          s.id,
        ),
      );
      const ordered = reorderSections(
        present,
        PRESENTATION_GROUPS.ACCOMMODATION,
      );
      expect(ordered.map((s) => s.id)).toEqual([
        'about',
        'amenities',
        'policies',
        'included',
        'attributes',
      ]);
    });

    test('EXPERIENCE surfaces itinerary immediately after about, ahead of attributes', () => {
      const present = allSections.filter((s) =>
        ['about', 'itinerary', 'attributes', 'amenities'].includes(s.id),
      );
      const ordered = reorderSections(present, PRESENTATION_GROUPS.EXPERIENCE);
      expect(ordered.map((s) => s.id)).toEqual([
        'about',
        'itinerary',
        'attributes',
        'amenities',
      ]);
    });

    test('TRANSPORT surfaces vehicle attributes right after about, ahead of amenities/policies', () => {
      const present = allSections.filter((s) =>
        ['about', 'attributes', 'included', 'amenities', 'policies'].includes(
          s.id,
        ),
      );
      const ordered = reorderSections(present, PRESENTATION_GROUPS.TRANSPORT);
      expect(ordered.map((s) => s.id)).toEqual([
        'about',
        'attributes',
        'included',
        'amenities',
        'policies',
      ]);
    });

    test('GENERIC keeps the original baseline order unchanged', () => {
      const ordered = reorderSections(allSections, PRESENTATION_GROUPS.GENERIC);
      expect(ordered.map((s) => s.id)).toEqual(allSections.map((s) => s.id));
    });

    test('only ever reorders sections that are actually present — never adds or drops any', () => {
      const present = [
        allSections.find((s) => s.id === 'about'),
        allSections.find((s) => s.id === 'reviews'),
      ];
      const ordered = reorderSections(
        present,
        PRESENTATION_GROUPS.ACCOMMODATION,
      );
      expect(ordered).toHaveLength(2);
      expect(ordered.map((s) => s.id).sort()).toEqual(['about', 'reviews']);
    });
  });

  describe('resolveBookingCtaKey', () => {
    test('returns a group-scoped i18n key, never literal copy', () => {
      expect(resolveBookingCtaKey(PRESENTATION_GROUPS.ACCOMMODATION)).toBe(
        'pages.listingDetail.reservation.requestToBookByGroup.ACCOMMODATION',
      );
      expect(resolveBookingCtaKey(PRESENTATION_GROUPS.TRANSPORT)).toBe(
        'pages.listingDetail.reservation.requestToBookByGroup.TRANSPORT',
      );
    });
  });

  // Pass 7 (category-specific visual identity) — `listing_type` alone
  // can't distinguish Apartments/Villas/Guest Houses (all PROPERTY) or
  // Attractions/Entertainment (both ATTRACTION); `resolveCategoryVisualKey`
  // closes that gap without touching `resolvePresentationGroup` itself.
  describe('resolveCategoryVisualKey', () => {
    test('returns the real category slug when it is one of the 9 known categories', () => {
      expect(
        resolveCategoryVisualKey({
          listingType: 'PROPERTY',
          categorySlug: 'villas',
        }),
      ).toBe(CATEGORY_VISUAL_KEYS.VILLAS);
      expect(
        resolveCategoryVisualKey({
          listingType: 'ATTRACTION',
          categorySlug: 'entertainment-venues',
        }),
      ).toBe(CATEGORY_VISUAL_KEYS.ENTERTAINMENT_VENUES);
    });

    test('falls back to the lower-cased presentation group when categorySlug is absent', () => {
      expect(resolveCategoryVisualKey({ listingType: 'CAR_RENTAL' })).toBe(
        'transport',
      );
      expect(resolveCategoryVisualKey()).toBe('generic');
    });

    test('falls back to the presentation group for an unrecognized category slug', () => {
      expect(
        resolveCategoryVisualKey({
          listingType: 'HOTEL',
          categorySlug: 'not-a-real-category',
        }),
      ).toBe('accommodation');
    });
  });

  describe('reorderSections keyed by category-visual-key (Pass 7)', () => {
    const allSections = [
      { id: 'about', label: 'About' },
      { id: 'attributes', label: 'Details' },
      { id: 'amenities', label: 'Amenities' },
      { id: 'policies', label: 'Policies' },
      { id: 'availability', label: 'Availability' },
      { id: 'location', label: 'Location' },
    ];

    test('Apartments/Villas/Guest Houses alias the same ACCOMMODATION order as Hotels', () => {
      const present = allSections.filter((s) =>
        ['about', 'amenities', 'policies', 'attributes'].includes(s.id),
      );
      const expected = reorderSections(
        present,
        PRESENTATION_GROUPS.ACCOMMODATION,
      ).map((s) => s.id);

      [
        CATEGORY_VISUAL_KEYS.HOTELS,
        CATEGORY_VISUAL_KEYS.APARTMENTS,
        CATEGORY_VISUAL_KEYS.VILLAS,
        CATEGORY_VISUAL_KEYS.GUEST_HOUSES,
      ].forEach((key) => {
        expect(reorderSections(present, key).map((s) => s.id)).toEqual(
          expected,
        );
      });
    });

    test('Attractions surfaces facts/visit-info ahead of availability, distinct from Experience', () => {
      const present = allSections.filter((s) =>
        [
          'about',
          'attributes',
          'amenities',
          'policies',
          'availability',
          'location',
        ].includes(s.id),
      );
      const ordered = reorderSections(
        present,
        CATEGORY_VISUAL_KEYS.ATTRACTIONS,
      );
      expect(ordered.map((s) => s.id)).toEqual([
        'about',
        'attributes',
        'amenities',
        'policies',
        'location',
        'availability',
      ]);
    });

    test('Entertainment surfaces availability (date/time/session) right after about, distinct from Attractions', () => {
      const present = allSections.filter((s) =>
        [
          'about',
          'availability',
          'location',
          'attributes',
          'policies',
        ].includes(s.id),
      );
      const ordered = reorderSections(
        present,
        CATEGORY_VISUAL_KEYS.ENTERTAINMENT_VENUES,
      );
      expect(ordered.map((s) => s.id)).toEqual([
        'about',
        'availability',
        'location',
        'attributes',
        'policies',
      ]);
    });
  });
});
