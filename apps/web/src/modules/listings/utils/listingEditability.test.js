import { describe, test, expect } from 'vitest';
import { isListingEditable } from './listingEditability.js';

describe('isListingEditable', () => {
  test.each(['DRAFT', 'UNPUBLISHED', 'ARCHIVED'])(
    '%s can be edited',
    (status) => {
      expect(isListingEditable(status)).toBe(true);
    },
  );

  test.each(['PENDING_REVIEW', 'PUBLISHED'])(
    '%s is locked, as the API locks it',
    (status) => {
      expect(isListingEditable(status)).toBe(false);
    },
  );
});
