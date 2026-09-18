/**
 * Step A3 — visitor/session identity (brief §8/§9/§10).
 *
 * `anonymous_visitor_id`: a stable UUID v4 in `localStorage`, created
 * once and reused across browser sessions. Never derived from
 * fingerprinting, never combined with account/email data, never used
 * for authorization — purely a client-generated, client-owned label the
 * server treats as an opaque dimension.
 *
 * `session_id`: a UUID v4 in `sessionStorage` (naturally scoped to one
 * tab/browser-session lifetime — closing the tab/browser already gives
 * a fresh one with no code needed for that case), rotated early if more
 * than 30 minutes have passed since the last tracked activity.
 *
 * Every storage access is wrapped so a throw (Safari private mode,
 * blocked storage, an extension interfering) degrades to an in-memory
 * id for the remainder of this page load rather than breaking the UI —
 * brief §8's "if localStorage access throws: analytics must fail safely
 * and not break the UI."
 */

const VISITOR_ID_KEY = 'desavii_analytics_visitor_id';
const SESSION_ID_KEY = 'desavii_analytics_session_id';
const SESSION_LAST_ACTIVITY_KEY = 'desavii_analytics_session_last_activity';

export const SESSION_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

function safeGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch {
    // Storage unavailable/blocked/full — the caller's in-memory fallback
    // still makes the id usable for the rest of this page load.
  }
}

function createUuid() {
  return crypto.randomUUID();
}

let inMemoryVisitorId = null;

/** Creates on first call, otherwise reuses the same id — from storage when available, in-memory only when it isn't. */
export function getOrCreateVisitorId() {
  const stored = safeGet(window.localStorage, VISITOR_ID_KEY);
  if (stored) {
    inMemoryVisitorId = stored;
    return stored;
  }
  if (inMemoryVisitorId) return inMemoryVisitorId;

  const created = createUuid();
  inMemoryVisitorId = created;
  safeSet(window.localStorage, VISITOR_ID_KEY, created);
  return created;
}

let inMemorySessionId = null;

/**
 * Resolves the active session id, rotating it when absent (new
 * tab/browser session) or when more than
 * `SESSION_INACTIVITY_TIMEOUT_MS` has passed since the last call —
 * always updates the last-activity timestamp as a side effect (brief
 * §10: "on each attempted trackEvent ... update local last-activity
 * timestamp").
 */
export function getOrCreateSessionId(now = Date.now()) {
  const storedId = safeGet(window.sessionStorage, SESSION_ID_KEY);
  const storedLastActivityRaw = safeGet(
    window.sessionStorage,
    SESSION_LAST_ACTIVITY_KEY,
  );
  const storedLastActivity = storedLastActivityRaw
    ? Number(storedLastActivityRaw)
    : null;
  const expired =
    storedLastActivity !== null &&
    now - storedLastActivity > SESSION_INACTIVITY_TIMEOUT_MS;

  let sessionId = storedId ?? inMemorySessionId;
  if (!sessionId || expired) {
    sessionId = createUuid();
  }

  inMemorySessionId = sessionId;
  safeSet(window.sessionStorage, SESSION_ID_KEY, sessionId);
  safeSet(window.sessionStorage, SESSION_LAST_ACTIVITY_KEY, String(now));
  return sessionId;
}

/** Test-only: clears the in-memory fallback so each test starts clean even when storage itself isn't reset. */
export function resetInMemoryIdentityForTests() {
  inMemoryVisitorId = null;
  inMemorySessionId = null;
}
