import { describe, test, expect } from '@jest/globals';
import {
  CARD_METADATA_SELECT,
  CARD_METADATA_COLUMNS,
  CARD_AMENITY_CODES,
  toCardMetadataDomain,
} from '../../../../src/modules/listings/repositories/listingCardMetadataSql.js';

describe('CARD_METADATA_SELECT — the shared card-facts SQL', () => {
  test('binds no parameters (a static fragment every card query can embed)', () => {
    expect(CARD_METADATA_SELECT).not.toContain('?');
  });

  test('yields exactly the documented columns', () => {
    CARD_METADATA_COLUMNS.forEach((column) => {
      expect(CARD_METADATA_SELECT).toContain(`AS ${column}`);
    });
  });

  test('counts an attribute only while it applies to the listing category', () => {
    expect(CARD_METADATA_SELECT).toContain('FROM category_attributes ca_card');
  });

  test('counts an amenity only while it applies to the listing category', () => {
    expect(CARD_METADATA_SELECT).toContain('amenity_category_applicability');
  });

  test('reads only the card-worthy amenities, never the whole catalogue', () => {
    CARD_AMENITY_CODES.forEach((code) => {
      expect(CARD_METADATA_SELECT).toContain(`'${code}'`);
    });
    expect(CARD_METADATA_SELECT).not.toContain("'WIFI'");
  });

  test('a deleted restaurant table never makes a listing reservable', () => {
    expect(CARD_METADATA_SELECT).toContain('bu_res.deleted_at IS NULL');
  });
});

describe('toCardMetadataDomain', () => {
  test('maps aggregated facts onto the card domain', () => {
    const domain = toCardMetadataDomain({
      category_slug: 'restaurants',
      card_enum_facts:
        'cuisine=ARMENIAN,cuisine=GEORGIAN,languages_offered=EN,price_tier=$$',
      card_number_facts: 'max_guests=4,seats=5',
      card_amenity_codes: 'OUTDOOR_SEATING,PARKING',
      card_reservable: 1,
      pricing_model_code: 'PER_PERSON',
    });
    expect(domain).toMatchObject({
      categorySlug: 'restaurants',
      cuisineCodes: ['ARMENIAN', 'GEORGIAN'],
      priceTierCode: '$$',
      languagesOfferedCodes: ['EN'],
      maxGuestsValue: 4,
      seatsValue: 5,
      amenityCodes: ['OUTDOOR_SEATING', 'PARKING'],
      isReservable: true,
      pricingModelCode: 'PER_PERSON',
    });
  });

  test('a listing with no stored facts maps to nulls, an empty list and false', () => {
    const domain = toCardMetadataDomain({
      category_slug: null,
      card_enum_facts: null,
      card_number_facts: null,
      card_amenity_codes: null,
      card_reservable: 0,
      pricing_model_code: null,
    });
    expect(domain.starRatingCode).toBeNull();
    expect(domain.cuisineCodes).toBeNull();
    expect(domain.bedroomsValue).toBeNull();
    expect(domain.amenityCodes).toEqual([]);
    expect(domain.isReservable).toBe(false);
  });

  test('columns absent from a narrower SELECT never throw', () => {
    expect(toCardMetadataDomain({})).toMatchObject({
      categorySlug: null,
      amenityCodes: [],
      isReservable: false,
      maxGuestsValue: null,
    });
  });

  test('a malformed or non-numeric pair is ignored, never guessed', () => {
    const domain = toCardMetadataDomain({
      card_enum_facts: 'broken,=X,star_rating=4',
      card_number_facts: 'seats=abc',
    });
    expect(domain.starRatingCode).toBe('4');
    expect(domain.seatsValue).toBeNull();
  });
});
