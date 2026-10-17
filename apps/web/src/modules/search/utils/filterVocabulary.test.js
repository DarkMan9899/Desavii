import { describe, test, expect } from 'vitest';
import i18n from 'i18next';
import {
  definitionLabel,
  groupLabel,
  isNamedByGroup,
  optionLabel,
  unitLabel,
} from './filterVocabulary.js';
import en from '../../../../public/locales/en/common.json';
import hy from '../../../../public/locales/hy/common.json';
import ru from '../../../../public/locales/ru/common.json';

// A dedicated instance with all three real catalogs, so every label below
// is the exact text a visitor reads in that language.
const instance = i18n.createInstance();
await instance.init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: { translation: en },
    hy: { translation: hy },
    ru: { translation: ru },
  },
  interpolation: { escapeValue: false },
});
const tFor = (lng) => instance.getFixedT(lng);

const STAR_RATING = { code: 'star_rating', value_source: 'ATTRIBUTE' };
const PRICE_TIER = { code: 'price_tier', value_source: 'ATTRIBUTE' };
const PETS = { code: 'pets_allowed', value_source: 'POLICY' };
const MEAL_PLAN = { code: 'meal_plan', value_source: 'ROOM' };
const RATING = { code: 'guest_rating', value_source: 'REVIEW' };
const AMENITIES = { code: 'amenity_ids', value_source: 'AMENITY' };

describe('filterVocabulary (apps/web/src/modules/search)', () => {
  test.each(['en', 'hy', 'ru'])(
    '%s: attribute and policy names come from the partner catalog vocabulary',
    (lng) => {
      const catalog = { en, hy, ru }[lng].partner.listingWizard;
      expect(definitionLabel(tFor(lng), STAR_RATING)).toBe(
        catalog.attributes.star_rating,
      );
      expect(definitionLabel(tFor(lng), PETS)).toBe(
        catalog.policies.pets_allowed,
      );
    },
  );

  test('a Search-specific name wins where the catalog name would be ambiguous', () => {
    expect(definitionLabel(tFor('en'), PRICE_TIER)).toBe(
      en.search.dynamicFilters.definitions.price_tier,
    );
    expect(definitionLabel(tFor('hy'), RATING)).toBe(
      hy.search.dynamicFilters.definitions.guest_rating,
    );
  });

  test('an unknown attribute falls back to its code, never to a raw key', () => {
    expect(
      definitionLabel(tFor('ru'), {
        code: 'brand_new',
        value_source: 'ATTRIBUTE',
      }),
    ).toBe('brand_new');
  });

  test('option labels: catalog options, meal plans, API amenity labels, ratings', () => {
    const t = tFor('ru');
    expect(optionLabel(t, STAR_RATING, { code: '5' }, 'ru')).toBe(
      ru.partner.listingWizard.options.star_rating['5'],
    );
    expect(optionLabel(t, MEAL_PLAN, { code: 'HALF_BOARD' }, 'ru')).toBe(
      ru.partner.listingWizard.mealPlans.HALF_BOARD,
    );
    expect(
      optionLabel(t, AMENITIES, { code: 'parking', label: 'Парковка' }, 'ru'),
    ).toBe('Парковка');
    expect(optionLabel(t, RATING, { code: '4.5' }, 'ru')).toBe('4,5+');
    expect(optionLabel(tFor('en'), RATING, { code: '4.5' }, 'en')).toBe('4.5+');
  });

  test('units pluralize by the language own rules', () => {
    expect(unitLabel(tFor('en'), 'rooms', 1)).toBe(
      en.partner.listingWizard.units.rooms_one,
    );
    expect(unitLabel(tFor('en'), 'rooms', 2)).toBe(
      en.partner.listingWizard.units.rooms_other,
    );
    expect(unitLabel(tFor('ru'), 'rooms', 5)).toBe(
      ru.partner.listingWizard.units.rooms_many,
    );
    expect(unitLabel(tFor('en'), null, 2)).toBe('');
  });

  test('group headings are localized', () => {
    expect(groupLabel(tFor('hy'), 'BOOKING')).toBe(
      hy.search.dynamicFilters.groups.BOOKING,
    );
  });

  test('a group of one same-named filter names it once; any other group does not', () => {
    const t = tFor('ru');
    expect(
      isNamedByGroup(
        t,
        { code: 'AMENITIES', definitions: [AMENITIES] },
        AMENITIES,
      ),
    ).toBe(true);
    expect(
      isNamedByGroup(
        t,
        { code: 'RATING', definitions: [STAR_RATING] },
        STAR_RATING,
      ),
    ).toBe(false);
    expect(
      isNamedByGroup(
        t,
        { code: 'AMENITIES', definitions: [AMENITIES, STAR_RATING] },
        AMENITIES,
      ),
    ).toBe(false);
  });
});
