/**
 * Step A3 — best-effort in-memory batching queue + transport (brief
 * §11/§12/§32/§33).
 *
 * Never persisted (no localStorage backlog — brief §11/§40): a queue
 * that outlives the page is a persistent retry mechanism, which the
 * brief explicitly forbids. Transport failures (network error, 429,
 * 422, 5xx, an ad blocker dropping the request outright, offline) are
 * always swallowed — this must never surface to the UI or block
 * navigation.
 *
 * Reuses `api/client.js`'s resolved base URL and `api/tokenStore.js`'s
 * synchronous access-token getter (the same one `apiClient`'s own
 * request interceptor reads) rather than importing `apiClient` itself:
 * `navigator.sendBeacon` and a `keepalive` `fetch` both need to run
 * outside axios's request/response interceptor pipeline (no JSON
 * response to parse on a beacon, no 401-refresh-and-retry semantics
 * wanted on a fire-and-forget analytics call).
 */

import apiClient from '../api/client.js';
import { getAccessToken } from '../api/tokenStore.js';

const ENDPOINT_PATH = '/analytics/events';
const MAX_BATCH_SIZE = 25;
const PERIODIC_FLUSH_INTERVAL_MS = 5000;
const FLUSH_THRESHOLD = 10;

let queue = [];
let flushTimer = null;
let lifecycleListenersRegistered = false;

function resolveEndpointUrl() {
  const base = apiClient.defaults.baseURL ?? '/api/v1';
  return `${base.replace(/\/$/, '')}${ENDPOINT_PATH}`;
}

function takeBatch() {
  const batch = queue.slice(0, MAX_BATCH_SIZE);
  queue = queue.slice(MAX_BATCH_SIZE);
  return batch;
}

/** Normal periodic/threshold flush — plain `fetch`, never blocks the caller. */
function flushViaFetch(events) {
  const headers = { 'Content-Type': 'application/json' };
  const accessToken = getAccessToken();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  fetch(resolveEndpointUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ events }),
    keepalive: true,
  }).catch(() => {
    // Best-effort only — brief §12: never retried, never surfaced.
  });
}

/**
 * Page-hide flush — prefers `navigator.sendBeacon` (survives the page
 * unloading, which an ordinary `fetch` is not guaranteed to). `sendBeacon`
 * has no header API, so an authenticated user's beacon-flushed events
 * carry no `Authorization` header and are processed anonymously by A2 —
 * a deliberate, documented trade-off (see the A3 handoff), never a
 * correctness bug: the backend still validates/resolves every event
 * exactly the same way, just without this one request's self/internal-
 * traffic filtering context.
 */
function flushOnPageHide(events) {
  const url = resolveEndpointUrl();
  const body = JSON.stringify({ events });

  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    const sent = navigator.sendBeacon(url, blob);
    if (sent) return;
  }

  // Fallback: a `keepalive` fetch survives unload for a short window in
  // browsers without (or where sendBeacon just failed) `sendBeacon`.
  flushViaFetch(events);
}

function flush({ pageHide = false } = {}) {
  if (queue.length === 0) return;
  const events = takeBatch();
  if (pageHide) {
    flushOnPageHide(events);
  } else {
    flushViaFetch(events);
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setInterval(() => flush(), PERIODIC_FLUSH_INTERVAL_MS);
}

function registerLifecycleListeners() {
  if (lifecycleListenersRegistered) return;
  if (typeof document === 'undefined') return;
  lifecycleListenersRegistered = true;

  // `pagehide` (not `unload`, which is unreliable/deprecated and blocks
  // bfcache) covers both a real navigation away and a tab close.
  window.addEventListener('pagehide', () => flush({ pageHide: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flush({ pageHide: true });
    }
  });
}

/** Enqueues one already-built event envelope; flushes immediately once the queue reaches a sensible size. */
export function enqueueEvent(event) {
  registerLifecycleListeners();
  scheduleFlush();
  queue.push(event);
  if (queue.length >= FLUSH_THRESHOLD) {
    flush();
  }
}

/** Test-only: resets all module state between tests. */
export function resetQueueForTests() {
  queue = [];
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  lifecycleListenersRegistered = false;
}

/** Test-only: current queue length, without mutating it. */
export function getQueueLengthForTests() {
  return queue.length;
}

/** Test-only: a shallow copy of the current queue contents, without mutating it. */
export function peekQueueForTests() {
  return [...queue];
}
