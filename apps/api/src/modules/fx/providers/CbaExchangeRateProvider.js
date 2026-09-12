/**
 * CbaExchangeRateProvider — Pass 8 (Multi-Currency / CBA FX Pricing).
 *
 * Real adapter against the Central Bank of Armenia's official
 * `ExchangeRates.asmx` SOAP web service, `ExchangeRatesLatest` operation
 * (brief §7) — confirmed live: `POST https://api.cba.am/exchangerates.asmx`
 * with `SOAPAction: "http://www.cba.am/ExchangeRatesLatest"` and a bare
 * `<ExchangeRatesLatest xmlns="http://www.cba.am/" />` body returns
 * `ExchangeRatesLatestResult` containing `CurrentDate` plus one
 * `ExchangeRate` per currency (`ISO`/`Amount`/`Rate`/`Difference`).
 *
 * Mirrors `modules/ai/providers/anthropicProvider.js`'s exact shape —
 * this codebase's one existing precedent for a real outbound third-party
 * HTTP integration: injectable `fetchImpl` (native global `fetch`,
 * defaulting to the real one so tests can substitute a stub), every
 * failure surfaced as `ExternalServiceError`, never an unhandled
 * rejection. Backend-only (brief §7: never called from the browser).
 *
 * Network safety (brief §10): HTTPS endpoint, a hard timeout via
 * `AbortSignal.timeout`, structured error handling for a network failure,
 * a non-2xx status, and unparsable/malformed XML — no retry loop here
 * (a single failed attempt is exactly one `ExternalServiceError`; the
 * calling service, not this adapter, owns retry/cache/fallback policy).
 */

import { XMLParser } from 'fast-xml-parser';
import { ExternalServiceError } from '../../../errors/AppError.js';
import { getModuleLogger } from '../../../logging/logger.js';

const log = getModuleLogger('fx:provider:cba');

const SOAP_ACTION = 'http://www.cba.am/ExchangeRatesLatest';
const SOAP_ENVELOPE = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ExchangeRatesLatest xmlns="http://www.cba.am/" />
  </soap:Body>
</soap:Envelope>`;

// `removeNSPrefix` — the real response's root elements carry a `soap:`
// prefix, the inner result elements don't; stripping prefixes uniformly
// means the navigation path below never has to special-case either.
const xmlParser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: true,
});

function isPositiveDecimalString(value) {
  return (
    typeof value === 'string' &&
    /^\d+(\.\d+)?$/.test(value) &&
    Number(value) > 0
  );
}

export class CbaExchangeRateProvider {
  #endpointUrl;

  #timeoutMs;

  #fetchImpl;

  constructor({ endpointUrl, timeoutMs = 8000, fetchImpl = fetch } = {}) {
    if (!endpointUrl) {
      throw new TypeError('CbaExchangeRateProvider requires an endpointUrl.');
    }
    this.#endpointUrl = endpointUrl;
    this.#timeoutMs = timeoutMs;
    this.#fetchImpl = fetchImpl;
  }

  // eslint-disable-next-line class-methods-use-this
  get code() {
    return 'cba';
  }

  /** @returns {Promise<{currentDate: string|null, rates: Array<{iso: string, amount: string, rate: string}>}>} */
  async fetchLatestRates() {
    let response;
    try {
      response = await this.#fetchImpl(this.#endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: `"${SOAP_ACTION}"`,
        },
        body: SOAP_ENVELOPE,
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (err) {
      log.error({ err }, 'CBA exchange-rate request failed');
      throw new ExternalServiceError(
        'Failed to reach the CBA exchange-rate service.',
      );
    }
    if (!response.ok) {
      log.error(
        { status: response.status },
        'CBA exchange-rate service returned a non-OK status',
      );
      throw new ExternalServiceError(
        'The CBA exchange-rate service returned an error.',
      );
    }
    const xml = await response.text();
    return this.#parse(xml);
  }

  // eslint-disable-next-line class-methods-use-this
  #parse(xml) {
    let parsed;
    try {
      parsed = xmlParser.parse(xml);
    } catch (err) {
      log.error({ err }, 'CBA exchange-rate response was not valid XML');
      throw new ExternalServiceError(
        'The CBA exchange-rate service returned an invalid response.',
      );
    }
    const result =
      parsed?.Envelope?.Body?.ExchangeRatesLatestResponse
        ?.ExchangeRatesLatestResult;
    if (!result) {
      log.error(
        { xml },
        'CBA exchange-rate response was missing the expected result element',
      );
      throw new ExternalServiceError(
        'The CBA exchange-rate service response was missing the expected result.',
      );
    }

    const rawRates = result.Rates?.ExchangeRate;
    // fast-xml-parser only returns an array when an element repeats more
    // than once — a hypothetical single-currency response would otherwise
    // be a bare object, so this always normalizes to a list.
    let rateList;
    if (Array.isArray(rawRates)) {
      rateList = rawRates;
    } else if (rawRates) {
      rateList = [rawRates];
    } else {
      rateList = [];
    }

    // Brief §10/§31: a malformed individual entry (missing ISO, zero/
    // negative/non-numeric Amount or Rate) is dropped, never allowed to
    // fail the whole batch or produce NaN/Infinity downstream.
    const rates = rateList
      .map((entry) => ({
        iso: String(entry?.ISO ?? '')
          .trim()
          .toUpperCase(),
        amount: String(entry?.Amount ?? ''),
        rate: String(entry?.Rate ?? ''),
      }))
      .filter(
        (entry) =>
          entry.iso.length > 0 &&
          isPositiveDecimalString(entry.amount) &&
          isPositiveDecimalString(entry.rate),
      );

    if (rates.length === 0) {
      throw new ExternalServiceError(
        'The CBA exchange-rate service returned no usable rates.',
      );
    }

    return {
      currentDate: result.CurrentDate ? String(result.CurrentDate) : null,
      rates,
    };
  }
}

export default CbaExchangeRateProvider;
