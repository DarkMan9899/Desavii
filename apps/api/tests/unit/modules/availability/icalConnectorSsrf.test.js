/**
 * Sprint D-1 (P0-3): the iCal connector's `feedUrl` is a partner-supplied
 * string that reaches a real outbound network `fetch` — before this fix,
 * `fetchIcsText` called `fetchImpl(feedUrl, {signal})` with no scheme
 * check, no private/loopback/link-local blocking, no DNS-rebinding
 * protection, and no redirect validation, making it a classic SSRF
 * surface (a partner's own `feedUrl` reaching internal services, cloud
 * metadata endpoints, or the server's own loopback).
 *
 * `fetchImpl`/`dnsLookupImpl` are constructor-injected specifically so
 * these tests can exercise the real validation/resolution code paths
 * without ever making a live network or DNS call.
 */

import { describe, test, expect, jest } from '@jest/globals';
import { IcalConnector } from '../../../../src/modules/availability/connectors/icalConnector.js';

function fakeFetchOk(body = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR') {
  return jest.fn(async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => body,
  }));
}

function fakeDnsLookup(addressesByHost) {
  return jest.fn(async (hostname) => {
    const addresses = addressesByHost[hostname];
    if (!addresses) throw new Error('ENOTFOUND');
    return addresses.map((address) => ({
      address,
      family: address.includes(':') ? 6 : 4,
    }));
  });
}

/** Mirrors `InventoryConnectionService#testConnection`'s own try/catch — the connector itself throws, the service converts to `{ok:false, message}`. */
async function testConnectionWith(feedUrl, { fetchImpl, dnsLookupImpl }) {
  const connector = new IcalConnector({ fetchImpl, dnsLookupImpl });
  try {
    return await connector.testConnection({ config: { feedUrl } });
  } catch (err) {
    return { ok: false, message: err.message ?? 'Connection test failed.' };
  }
}

describe('IcalConnector — SSRF protections on feedUrl (Sprint D-1, P0-3)', () => {
  test('a valid public https URL is accepted and actually fetched', async () => {
    const fetchImpl = fakeFetchOk();
    const dnsLookupImpl = fakeDnsLookup({
      'feeds.example-ota.com': ['93.184.216.34'],
    });

    const result = await testConnectionWith(
      'https://feeds.example-ota.com/calendar.ics',
      { fetchImpl, dnsLookupImpl },
    );
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('a malformed URL is rejected before any fetch is attempted', async () => {
    const fetchImpl = fakeFetchOk();
    const dnsLookupImpl = fakeDnsLookup({});

    const result = await testConnectionWith('not a url', {
      fetchImpl,
      dnsLookupImpl,
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('an unsupported scheme (file:) is rejected before any fetch is attempted', async () => {
    const fetchImpl = fakeFetchOk();
    const dnsLookupImpl = fakeDnsLookup({});

    const result = await testConnectionWith('file:///etc/passwd', {
      fetchImpl,
      dnsLookupImpl,
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('plain http is rejected — only https is allowed', async () => {
    const fetchImpl = fakeFetchOk();
    const dnsLookupImpl = fakeDnsLookup({
      'feeds.example-ota.com': ['93.184.216.34'],
    });

    const result = await testConnectionWith(
      'http://feeds.example-ota.com/calendar.ics',
      { fetchImpl, dnsLookupImpl },
    );
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('a literal 127.0.0.1 URL is rejected before any fetch is attempted', async () => {
    const fetchImpl = fakeFetchOk();
    const dnsLookupImpl = fakeDnsLookup({});

    const result = await testConnectionWith('https://127.0.0.1/admin', {
      fetchImpl,
      dnsLookupImpl,
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('"localhost" is rejected (resolves to a loopback address)', async () => {
    const fetchImpl = fakeFetchOk();
    const dnsLookupImpl = fakeDnsLookup({ localhost: ['127.0.0.1'] });

    const result = await testConnectionWith(
      'https://localhost:8080/calendar.ics',
      {
        fetchImpl,
        dnsLookupImpl,
      },
    );
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(dnsLookupImpl).toHaveBeenCalledWith('localhost', expect.any(Object));
  });

  test('a private IPv4 literal (10.x) is rejected', async () => {
    const fetchImpl = fakeFetchOk();
    const dnsLookupImpl = fakeDnsLookup({});

    const result = await testConnectionWith('https://10.0.5.9/calendar.ics', {
      fetchImpl,
      dnsLookupImpl,
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('a cloud metadata address (169.254.169.254) is rejected', async () => {
    const fetchImpl = fakeFetchOk();
    const dnsLookupImpl = fakeDnsLookup({});

    const result = await testConnectionWith(
      'https://169.254.169.254/latest/meta-data/',
      { fetchImpl, dnsLookupImpl },
    );
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('the IPv6 loopback literal (::1) is rejected', async () => {
    const fetchImpl = fakeFetchOk();
    const dnsLookupImpl = fakeDnsLookup({});

    const result = await testConnectionWith('https://[::1]/calendar.ics', {
      fetchImpl,
      dnsLookupImpl,
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('an IPv6 link-local literal (fe80::...) is rejected', async () => {
    const fetchImpl = fakeFetchOk();
    const dnsLookupImpl = fakeDnsLookup({});

    const result = await testConnectionWith(
      'https://[fe80::1234]/calendar.ics',
      { fetchImpl, dnsLookupImpl },
    );
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('a hostname that resolves to a private address is rejected — DNS is checked, not just the literal string', async () => {
    const fetchImpl = fakeFetchOk();
    const dnsLookupImpl = fakeDnsLookup({
      'evil-tracker.example': ['10.0.0.5'],
    });

    const result = await testConnectionWith(
      'https://evil-tracker.example/calendar.ics',
      { fetchImpl, dnsLookupImpl },
    );
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(dnsLookupImpl).toHaveBeenCalledWith(
      'evil-tracker.example',
      expect.any(Object),
    );
  });

  test('a redirect response is not followed and is treated as blocked', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 302,
      headers: { get: () => null },
      text: async () => '',
    }));
    const dnsLookupImpl = fakeDnsLookup({
      'feeds.example-ota.com': ['93.184.216.34'],
    });

    const result = await testConnectionWith(
      'https://feeds.example-ota.com/calendar.ics',
      { fetchImpl, dnsLookupImpl },
    );
    expect(result.ok).toBe(false);
    // The fetch itself IS attempted (redirect: 'manual' still requires
    // sending the request) — what must never happen is silently following it.
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  test('an ordinary remote public endpoint still works end to end (no mocked network dependency)', async () => {
    const fetchImpl = fakeFetchOk(
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1@ota.com\r\nDTSTART;VALUE=DATE:20260901\r\nDTEND;VALUE=DATE:20260902\r\nEND:VEVENT\r\nEND:VCALENDAR',
    );
    const dnsLookupImpl = fakeDnsLookup({
      'calendar.real-ota.com': ['93.184.216.34'],
    });

    const result = await testConnectionWith(
      'https://calendar.real-ota.com/export.ics',
      { fetchImpl, dnsLookupImpl },
    );
    expect(result.ok).toBe(true);
    expect(result.message).toContain('1 event(s) found');
  });
});
