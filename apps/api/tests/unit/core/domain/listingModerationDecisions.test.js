import { describe, test, expect } from '@jest/globals';
import { resolveModerationDecision } from '../../../../src/core/domain/listingModerationDecisions.js';

describe('resolveModerationDecision — the closed M2B decision matrix', () => {
  test('PENDING_REVIEW + APPROVED -> PUBLISHED via the publish write mode, no reason required', () => {
    const decision = resolveModerationDecision('PENDING_REVIEW', 'APPROVED');
    expect(decision).toEqual({
      targetStatusCode: 'PUBLISHED',
      writeMode: 'publish',
      requiresReason: false,
      setUnpublishedAt: false,
    });
  });

  test('PENDING_REVIEW + REJECTED -> DRAFT, reason required, no unpublished_at', () => {
    const decision = resolveModerationDecision('PENDING_REVIEW', 'REJECTED');
    expect(decision).toEqual({
      targetStatusCode: 'DRAFT',
      writeMode: 'return',
      requiresReason: true,
      setUnpublishedAt: false,
    });
  });

  test('PUBLISHED + REJECTED -> UNPUBLISHED, reason required, sets unpublished_at', () => {
    const decision = resolveModerationDecision('PUBLISHED', 'REJECTED');
    expect(decision).toEqual({
      targetStatusCode: 'UNPUBLISHED',
      writeMode: 'return',
      requiresReason: true,
      setUnpublishedAt: true,
    });
  });

  test('PUBLISHED + FLAGGED -> UNPUBLISHED, no reason required, sets unpublished_at', () => {
    const decision = resolveModerationDecision('PUBLISHED', 'FLAGGED');
    expect(decision).toEqual({
      targetStatusCode: 'UNPUBLISHED',
      writeMode: 'return',
      requiresReason: false,
      setUnpublishedAt: true,
    });
  });

  test('PUBLISHED + APPROVED -> idempotent re-confirmation, moderation-only write, no status_id change', () => {
    const decision = resolveModerationDecision('PUBLISHED', 'APPROVED');
    expect(decision).toEqual({
      targetStatusCode: 'PUBLISHED',
      writeMode: 'moderationOnly',
      requiresReason: false,
      setUnpublishedAt: false,
    });
  });

  test.each([
    ['DRAFT', 'APPROVED'],
    ['DRAFT', 'REJECTED'],
    ['DRAFT', 'FLAGGED'],
    ['DRAFT', 'PENDING'],
    ['PENDING_REVIEW', 'FLAGGED'],
    ['PENDING_REVIEW', 'PENDING'],
    ['UNPUBLISHED', 'APPROVED'],
    ['UNPUBLISHED', 'REJECTED'],
    ['UNPUBLISHED', 'FLAGGED'],
    ['PUBLISHED', 'PENDING'],
    ['ARCHIVED', 'APPROVED'],
    ['ARCHIVED', 'REJECTED'],
    ['ARCHIVED', 'FLAGGED'],
    ['ARCHIVED', 'PENDING'],
  ])(
    '%s + %s is not in the closed allowlist -> null (Service must reject, never partially write)',
    (statusCode, requested) => {
      expect(resolveModerationDecision(statusCode, requested)).toBeNull();
    },
  );

  test('an entirely unknown status pair returns null rather than throwing', () => {
    expect(resolveModerationDecision('NOT_A_STATUS', 'APPROVED')).toBeNull();
    expect(resolveModerationDecision('DRAFT', 'NOT_A_MOD_STATUS')).toBeNull();
  });
});
