import { describe, test, expect } from 'vitest';
import { toDetailCardDto } from './detailCardDto.js';

const METADATA = {
  amenity_groups: [
    {
      code: 'GENERAL',
      amenities: [
        { value: 1, code: 'Pool', key: 'POOL' },
        { value: 2, code: 'Parking', key: 'PARKING' },
        { value: 3, code: 'Legacy perk', key: null },
      ],
    },
  ],
};

describe('toDetailCardDto', () => {
  test('maps the listing amenities to stable codes the card rules read', () => {
    expect(
      toDetailCardDto({ amenity_ids: [1, 3, 99] }, METADATA).amenities,
    ).toEqual(['POOL']);
  });

  test('carries the approved-review aggregate unchanged', () => {
    const dto = toDetailCardDto(
      { rating_average: 4.5, review_count: 3, amenity_ids: [] },
      METADATA,
    );
    expect(dto).toMatchObject({ rating_average: 4.5, review_count: 3 });
  });

  test('no metadata yet: no amenities, never a guess', () => {
    expect(toDetailCardDto({ amenity_ids: [1] }, undefined).amenities).toEqual(
      [],
    );
  });
});
