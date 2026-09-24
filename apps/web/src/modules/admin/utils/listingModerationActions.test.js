import { describe, test, expect } from 'vitest';
import {
  getAllowedModerationActions,
  moderationErrorMessageKey,
} from './listingModerationActions.js';

describe('getAllowedModerationActions (Step M3 — mirrors the backend decision matrix)', () => {
  test('PENDING_REVIEW allows Approve and Return for changes', () => {
    const actions = getAllowedModerationActions({ status: 'PENDING_REVIEW' });
    expect(actions).toEqual([
      { status: 'APPROVED', kind: 'approve', requiresReason: false },
      { status: 'REJECTED', kind: 'returnForChanges', requiresReason: true },
    ]);
  });

  test('PUBLISHED allows Reject and Flag', () => {
    const actions = getAllowedModerationActions({ status: 'PUBLISHED' });
    expect(actions).toEqual([
      { status: 'REJECTED', kind: 'reject', requiresReason: true },
      { status: 'FLAGGED', kind: 'flag', requiresReason: false },
    ]);
  });

  test.each(['DRAFT', 'UNPUBLISHED', 'ARCHIVED'])(
    '%s allows no moderation action',
    (status) => {
      expect(getAllowedModerationActions({ status })).toEqual([]);
    },
  );

  test('a missing listing returns no actions rather than throwing', () => {
    expect(getAllowedModerationActions(null)).toEqual([]);
    expect(getAllowedModerationActions(undefined)).toEqual([]);
  });

  test('an unknown status returns no actions', () => {
    expect(getAllowedModerationActions({ status: 'NOT_A_STATUS' })).toEqual([]);
  });
});

describe('moderationErrorMessageKey (brief §16 — never swallows the error code)', () => {
  test('maps FORBIDDEN to the permission key', () => {
    expect(moderationErrorMessageKey({ code: 'FORBIDDEN', status: 403 })).toBe(
      'admin.listingModeration.error.permission',
    );
  });

  test('maps NOT_FOUND to the not-found key', () => {
    expect(moderationErrorMessageKey({ code: 'NOT_FOUND', status: 404 })).toBe(
      'admin.listingModeration.error.notFound',
    );
  });

  test('maps any 409 status to the conflict key, regardless of the specific code', () => {
    expect(
      moderationErrorMessageKey({
        code: 'INVALID_MODERATION_TRANSITION',
        status: 409,
      }),
    ).toBe('admin.listingModeration.error.conflict');
    expect(
      moderationErrorMessageKey({ code: 'LISTING_DELETED', status: 409 }),
    ).toBe('admin.listingModeration.error.conflict');
  });

  test('maps VALIDATION_FAILED to the reason-required key', () => {
    expect(
      moderationErrorMessageKey({ code: 'VALIDATION_FAILED', status: 422 }),
    ).toBe('admin.listingModeration.error.reasonRequired');
  });

  test('maps NETWORK_ERROR to the network key', () => {
    expect(moderationErrorMessageKey({ code: 'NETWORK_ERROR' })).toBe(
      'admin.listingModeration.error.network',
    );
  });

  test('falls back to the generic status error for anything else', () => {
    expect(moderationErrorMessageKey({ code: 'UNKNOWN_ERROR' })).toBe(
      'admin.listingModeration.statusError',
    );
    expect(moderationErrorMessageKey(undefined)).toBe(
      'admin.listingModeration.statusError',
    );
  });
});
