import { describe, test, expect } from 'vitest';
import {
  PRESENTATION_GROUPS,
  resolvePresentationGroup,
  CATEGORY_VISUAL_KEYS,
  resolveCategoryVisualKey,
  reorderSections,
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
      { id: 'reviews', label: 'Reviews' },
      { id: 'location', label: 'Location' },
      { id: 'partner', label: 'About the company' },
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

    // Listing Detail redesign: guests' reviews before the map and the
    // company, in every category's order.
    test('every order reads reviews, then the place, then the company', () => {
      Object.values(PRESENTATION_GROUPS).forEach((group) => {
        const ids = reorderSections(allSections, group).map((s) => s.id);
        expect(ids.indexOf('reviews')).toBeLessThan(ids.indexOf('location'));
        expect(ids.indexOf('location')).toBeLessThan(ids.indexOf('partner'));
      });
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

  // Listing Detail rebuild: "Good to know" sits right after what's
  // included for experiences and with the rental terms for a car, and an
  // attraction's itinerary no longer falls to the end of the page.
  describe('reorderSections — guest notes and experience content', () => {
    const sections = (ids) => ids.map((id) => ({ id, label: id }));
    const order = (ids, key) =>
      reorderSections(sections(ids), key).map((section) => section.id);

    test('tours: itinerary, included, then good to know', () => {
      expect(
        order(['faq', 'guestNotes', 'included', 'itinerary', 'about'], 'tours'),
      ).toEqual(['about', 'itinerary', 'included', 'guestNotes', 'faq']);
    });

    test('car rentals: good to know follows the rental terms', () => {
      expect(
        order(
          ['guestNotes', 'policies', 'attributes', 'location'],
          'car-rentals',
        ),
      ).toEqual(['attributes', 'policies', 'guestNotes', 'location']);
    });

    test('attractions and entertainment place itinerary, included and good to know before the FAQ', () => {
      const ids = ['faq', 'guestNotes', 'included', 'itinerary', 'about'];
      expect(order(ids, 'attractions')).toEqual([
        'about',
        'itinerary',
        'included',
        'guestNotes',
        'faq',
      ]);
      expect(order(ids, 'entertainment-venues')).toEqual([
        'about',
        'itinerary',
        'included',
        'guestNotes',
        'faq',
      ]);
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
        'availability',
        'location',
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
        'attributes',
        'policies',
        'location',
      ]);
    });
  });
});
