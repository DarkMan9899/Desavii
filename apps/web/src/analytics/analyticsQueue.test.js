import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  enqueueEvent,
  resetQueueForTests,
  getQueueLengthForTests,
} from './analyticsQueue.js';

const EVENT = {
  eventId: 'event-1',
  eventName: 'listing_viewed',
  sessionId: 'session-1',
  anonymousVisitorId: 'visitor-1',
  listingId: 5,
};

beforeEach(() => {
  resetQueueForTests();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});

afterEach(() => {
  resetQueueForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('enqueueEvent', () => {
  test('enqueues a valid event without flushing immediately below the threshold', () => {
    enqueueEvent(EVENT);
    expect(getQueueLengthForTests()).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('flushes automatically once the queue reaches the threshold', () => {
    for (let i = 0; i < 10; i += 1) {
      enqueueEvent({ ...EVENT, eventId: `event-${i}` });
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, options] = fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.events).toHaveLength(10);
    expect(getQueueLengthForTests()).toBe(0);
  });

  test('never sends a batch larger than 25', () => {
    for (let i = 0; i < 30; i += 1) {
      enqueueEvent({ ...EVENT, eventId: `event-${i}` });
    }
    // Threshold-triggered flushes happen every 10 events, but the queue
    // itself must never hand a single request more than 25.
    const allBatchSizes = fetch.mock.calls.map(
      ([, options]) => JSON.parse(options.body).events.length,
    );
    allBatchSizes.forEach((size) => expect(size).toBeLessThanOrEqual(25));
  });

  test('every enqueued event keeps its own unique event_id', () => {
    enqueueEvent({ ...EVENT, eventId: 'a' });
    enqueueEvent({ ...EVENT, eventId: 'b' });
    expect(getQueueLengthForTests()).toBe(2);
  });

  test('a network failure is swallowed, never thrown, never retried', async () => {
    fetch.mockRejectedValue(new Error('network down'));
    for (let i = 0; i < 10; i += 1) {
      enqueueEvent({ ...EVENT, eventId: `event-${i}` });
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    // No re-queue on failure — the batch is dropped, not retried.
    expect(getQueueLengthForTests()).toBe(0);
  });

  test('a 429/422/5xx response is swallowed the same way (fetch resolves, never rejects, on an HTTP error)', async () => {
    fetch.mockResolvedValue({ ok: false, status: 429 });
    for (let i = 0; i < 10; i += 1) {
      enqueueEvent({ ...EVENT, eventId: `event-${i}` });
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getQueueLengthForTests()).toBe(0);
  });

  test('attaches the access token as a Bearer header when one is present', async () => {
    const { setAccessToken, clearAccessToken } =
      await import('../api/tokenStore.js');
    setAccessToken('a-real-token');
    for (let i = 0; i < 10; i += 1) {
      enqueueEvent({ ...EVENT, eventId: `event-${i}` });
    }
    const [, options] = fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer a-real-token');
    clearAccessToken();
  });

  test('sends no Authorization header when anonymous', () => {
    for (let i = 0; i < 10; i += 1) {
      enqueueEvent({ ...EVENT, eventId: `event-${i}` });
    }
    const [, options] = fetch.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });
});

describe('pagehide flush', () => {
  test('prefers navigator.sendBeacon when available', () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon });

    enqueueEvent(EVENT);
    window.dispatchEvent(new Event('pagehide'));

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0];
    expect(url).toContain('/analytics/events');
    expect(blob.type).toBe('application/json');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('falls back to keepalive fetch when sendBeacon is unavailable', () => {
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: undefined });

    enqueueEvent(EVENT);
    window.dispatchEvent(new Event('pagehide'));

    expect(fetch).toHaveBeenCalledTimes(1);
    const [, options] = fetch.mock.calls[0];
    expect(options.keepalive).toBe(true);
  });
});
