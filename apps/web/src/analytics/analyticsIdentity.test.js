import { describe, test, expect, beforeEach } from 'vitest';
import {
  getOrCreateVisitorId,
  getOrCreateSessionId,
  SESSION_INACTIVITY_TIMEOUT_MS,
  resetInMemoryIdentityForTests,
} from './analyticsIdentity.js';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetInMemoryIdentityForTests();
});

describe('getOrCreateVisitorId', () => {
  test('creates a UUID v4 and stores it under the documented key', () => {
    const id = getOrCreateVisitorId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(window.localStorage.getItem('desavii_analytics_visitor_id')).toBe(
      id,
    );
  });

  test('reuses the same id across calls', () => {
    const first = getOrCreateVisitorId();
    const second = getOrCreateVisitorId();
    expect(second).toBe(first);
  });

  test('reuses an id already present in localStorage (survives across sessions)', () => {
    window.localStorage.setItem('desavii_analytics_visitor_id', 'existing-id');
    expect(getOrCreateVisitorId()).toBe('existing-id');
  });

  test('degrades to an in-memory id, without throwing, when localStorage.getItem throws', () => {
    const original = window.localStorage.getItem;
    window.localStorage.getItem = () => {
      throw new Error('blocked');
    };
    let id;
    expect(() => {
      id = getOrCreateVisitorId();
    }).not.toThrow();
    expect(id).toBeTruthy();
    expect(getOrCreateVisitorId()).toBe(id); // stable across calls even without storage
    window.localStorage.getItem = original;
  });

  test('degrades to an in-memory id, without throwing, when localStorage.setItem throws', () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error('quota exceeded');
    };
    let id;
    expect(() => {
      id = getOrCreateVisitorId();
    }).not.toThrow();
    expect(id).toBeTruthy();
    window.localStorage.setItem = original;
  });
});

describe('getOrCreateSessionId', () => {
  test('creates a UUID v4 and stores it under the documented key', () => {
    const id = getOrCreateSessionId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(window.sessionStorage.getItem('desavii_analytics_session_id')).toBe(
      id,
    );
  });

  test('reuses the same session id under 30 minutes of inactivity', () => {
    const first = getOrCreateSessionId(1_000_000);
    const second = getOrCreateSessionId(1_000_000 + 5 * 60 * 1000); // +5 min
    expect(second).toBe(first);
  });

  test('rotates the session id after > 30 minutes of inactivity', () => {
    const first = getOrCreateSessionId(1_000_000);
    const second = getOrCreateSessionId(
      1_000_000 + SESSION_INACTIVITY_TIMEOUT_MS + 1,
    );
    expect(second).not.toBe(first);
  });

  test('a fresh sessionStorage (new browser session) creates a new session id', () => {
    const first = getOrCreateSessionId(1_000_000);
    window.sessionStorage.clear();
    resetInMemoryIdentityForTests();
    const second = getOrCreateSessionId(1_000_100);
    expect(second).not.toBe(first);
  });

  test('degrades to an in-memory session id, without throwing, when sessionStorage throws', () => {
    const original = window.sessionStorage.getItem;
    window.sessionStorage.getItem = () => {
      throw new Error('blocked');
    };
    let id;
    expect(() => {
      id = getOrCreateSessionId();
    }).not.toThrow();
    expect(id).toBeTruthy();
    window.sessionStorage.getItem = original;
  });
});
