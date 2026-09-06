/**
 * IcalConnector — real fetch + parse + idempotent import against an
 * external iCal feed (Airbnb/VRBO/Booking.com-style "export URL")
 * (Phase 17 §19). Per Phase 17 spec §61 ("do not send real reservations
 * to... during this phase", "real provider credentials are NOT
 * required"), this is never live-called against a real third-party URL
 * anywhere in this codebase's tests or demo data — `config.fixtureIcs`
 * (a literal .ics string stored on the connection) is what demo seeding
 * and integration tests use instead of `config.feedUrl` (a real HTTP(S)
 * fetch), so the exact same import/parse/idempotency code path is
 * genuinely exercised without any network dependency. A partner who
 * configures a real `feedUrl` in production gets the real `fetch` path
 * with no code change.
 *
 * One iCal connection maps to exactly one `bookable_unit_id` — the
 * common real-world shape (one export-URL per room type/vehicle) —
 * resolved via a single `inventory_connection_mappings` row keyed
 * `external_resource_id = 'default'`, so a future multi-resource iCal
 * feed only needs additional mapping rows, not a schema/code change.
 */

import dns from 'node:dns/promises';
import net from 'node:net';
import { InventoryConnector } from './InventoryConnector.js';
import { parseIcalEvents } from './icalParser.js';
import { ExternalServiceError } from '../../../errors/AppError.js';

const DEFAULT_MAPPING_KEY = 'default';
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROTOCOLS = new Set(['https:']);

/** Rejects anything that isn't a well-formed https URL — a `feedUrl` is a partner-supplied string, never trusted as-is. */
function parseSafeFeedUrl(feedUrl) {
  let parsed;
  try {
    parsed = new URL(feedUrl);
  } catch {
    throw new ExternalServiceError(
      'The iCal feed URL is not a valid URL.',
      'INVALID_FEED_URL',
    );
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol) || !parsed.hostname) {
    throw new ExternalServiceError(
      'The iCal feed URL must be an https URL.',
      'INVALID_FEED_URL',
    );
  }
  return parsed;
}

function isDisallowedIPv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b, c] = parts;
  if (a === 0) return true; // 0.0.0.0/8 — "this network"
  if (a === 10) return true; // 10.0.0.0/8 — private
  if (a === 127) return true; // 127.0.0.0/8 — loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 — CGNAT
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 — link-local (incl. cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 — private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 — private
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 — IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 — TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 — benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 — TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 — TEST-NET-3
  if (a >= 224) return true; // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved, 255.255.255.255 broadcast
  return false;
}

function isDisallowedIPv6(address) {
  const normalized = address.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isDisallowedIPv4(mapped[1]);
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true; // fe80::/10 — link-local
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // fc00::/7 — unique local
  return false;
}

/** Fails closed: anything that isn't a recognizable public IPv4/IPv6 address is treated as disallowed. */
function isDisallowedAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return isDisallowedIPv4(address);
  if (family === 6) return isDisallowedIPv6(address);
  return true;
}

/** Caps how much of a feed response is ever read into memory — this connector fetches text, not arbitrary payloads. */
async function readBodyWithLimit(response) {
  const contentLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new ExternalServiceError(
      'The iCal feed response is too large.',
      'FEED_RESPONSE_TOO_LARGE',
    );
  }
  const reader = response.body?.getReader?.();
  if (!reader) return response.text();

  const decoder = new TextDecoder();
  let text = '';
  let bytesRead = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- a streamed read is inherently sequential.
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > MAX_RESPONSE_BYTES) {
      // eslint-disable-next-line no-await-in-loop -- cleanup for the sequential read above, on the same abort path.
      await reader.cancel();
      throw new ExternalServiceError(
        'The iCal feed response is too large.',
        'FEED_RESPONSE_TOO_LARGE',
      );
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

async function fetchIcsText(feedUrl, fetchImpl, dnsLookupImpl) {
  const parsed = parseSafeFeedUrl(feedUrl);

  // Sprint D-1 (P0-3): resolved fresh on every fetch (never cached across
  // syncs) so a hostname that later starts resolving to a private address
  // — DNS rebinding — is caught on the very next sync, not just at
  // connection-creation time. "Do not fetch first and validate afterward."
  const literalIpFamily = net.isIP(parsed.hostname);
  const addresses =
    literalIpFamily !== 0
      ? [parsed.hostname]
      : await dnsLookupImpl(parsed.hostname, { all: true })
          .then((records) => records.map((r) => r.address))
          .catch(() => {
            throw new ExternalServiceError(
              'The iCal feed URL could not be resolved.',
              'FEED_URL_UNRESOLVABLE',
            );
          });
  if (addresses.length === 0 || addresses.some(isDisallowedAddress)) {
    throw new ExternalServiceError(
      'The iCal feed URL resolves to a disallowed network address.',
      'FEED_URL_BLOCKED',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // `redirect: 'manual'` — a redirect target is never validated against
    // the same allow-list otherwise, so it is simply never followed
    // (spec: "disable automatic redirects... or validate every
    // redirect destination with the same rules").
    const response = await fetchImpl(parsed.toString(), {
      signal: controller.signal,
      redirect: 'manual',
    });
    if (response.status >= 300 && response.status < 400) {
      throw new ExternalServiceError(
        'The iCal feed redirected to another URL, which is not allowed.',
        'FEED_URL_BLOCKED',
      );
    }
    if (!response.ok) {
      throw new ExternalServiceError(
        `iCal feed returned HTTP ${response.status}.`,
      );
    }
    return await readBodyWithLimit(response);
  } catch (err) {
    if (err instanceof ExternalServiceError) throw err;
    throw new ExternalServiceError('Failed to fetch the iCal feed.');
  } finally {
    clearTimeout(timeout);
  }
}

export class IcalConnector extends InventoryConnector {
  #fetchImpl;

  #dnsLookupImpl;

  constructor({ fetchImpl = fetch, dnsLookupImpl = dns.lookup } = {}) {
    super();
    this.#fetchImpl = fetchImpl;
    this.#dnsLookupImpl = dnsLookupImpl;
  }

  // eslint-disable-next-line class-methods-use-this
  get code() {
    return 'ICAL';
  }

  // eslint-disable-next-line class-methods-use-this
  get capabilities() {
    return ['IMPORT_AVAILABILITY', 'POLLING', 'ICAL', 'BULK_IMPORT'];
  }

  async #readIcsText(connectionRecord) {
    const { feedUrl, fixtureIcs } = connectionRecord.config ?? {};
    if (fixtureIcs) return fixtureIcs;
    if (!feedUrl) {
      throw new ExternalServiceError(
        'This iCal connection has no feedUrl configured.',
      );
    }
    return fetchIcsText(feedUrl, this.#fetchImpl, this.#dnsLookupImpl);
  }

  async testConnection(connectionRecord) {
    const icsText = await this.#readIcsText(connectionRecord);
    const events = parseIcalEvents(icsText);
    return {
      ok: true,
      message: `Feed reachable — ${events.length} event(s) found.`,
    };
  }

  /**
   * @param {object} context
   * @param {object} context.connectionRecord
   * @param {(externalResourceId:string)=>(number|undefined)} context.resolveUnitId
   * @param {(event:object, unitId:number)=>Promise<{created:boolean, conflict?:object}>} context.applyReservation
   * @param {(externalEventUid:string)=>Promise<void>} context.cancelReservation
   * @param {string[]} context.previouslyImportedUids - UIDs already imported from this connection, so removed/changed events can be detected (spec §19).
   */
  async importAvailability({
    connectionRecord,
    resolveUnitId,
    applyReservation,
    cancelReservation,
    previouslyImportedUids,
  }) {
    const icsText = await this.#readIcsText(connectionRecord);
    const events = parseIcalEvents(icsText);
    const unitId = resolveUnitId(DEFAULT_MAPPING_KEY);

    const conflicts = [];
    let recordsCreated = 0;
    let recordsUpdated = 0;
    let recordsSkipped = 0;

    if (!unitId) {
      conflicts.push({
        externalEventUid: null,
        conflictType: 'AMBIGUOUS_MAPPING',
        details: {
          message: 'No bookable unit mapped for this iCal connection.',
        },
      });
      return {
        recordsReceived: events.length,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsSkipped: events.length,
        conflicts,
      };
    }

    const seenUids = new Set();
    for (const event of events) {
      seenUids.add(event.uid);
      if (event.status === 'CANCELLED') {
        // eslint-disable-next-line no-await-in-loop -- events are applied sequentially within one sync run's transaction.
        await cancelReservation(event.uid);
      } else {
        // eslint-disable-next-line no-await-in-loop
        const result = await applyReservation(event, unitId);
        if (result.conflict) {
          // A genuine capacity conflict on this one event (e.g. it
          // overlaps a booking already held on Desavii's side) — record
          // it and keep processing the rest of the feed; it must not
          // abort the whole sync run.
          conflicts.push(result.conflict);
        } else if (result.created) {
          recordsCreated += 1;
        } else if (result.updated) {
          // Sprint D-1 (P0-4): the same UID re-synced with different
          // dates/unit/quantity — moved in place, not skipped.
          recordsUpdated += 1;
        } else {
          recordsSkipped += 1;
        }
      }
    }

    // Reconciliation (spec §24): a UID we previously imported that's no
    // longer in the feed means the external booking was removed/cancelled
    // upstream — release the capacity it held.
    const removedUids = previouslyImportedUids.filter(
      (uid) => !seenUids.has(uid),
    );
    for (const uid of removedUids) {
      // eslint-disable-next-line no-await-in-loop
      await cancelReservation(uid);
    }

    return {
      recordsReceived: events.length,
      recordsCreated,
      recordsUpdated,
      recordsSkipped,
      conflicts,
    };
  }
}

export default IcalConnector;
