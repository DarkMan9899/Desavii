/**
 * Pass 8 (Multi-Currency / CBA FX Pricing) — `CbaExchangeRateProvider`.
 *
 * The XML fixture below mirrors the REAL response shape captured live
 * from `https://api.cba.am/exchangerates.asmx` during this pass's own
 * implementation (soap: envelope prefix on the outer elements, none on
 * the inner result) — including a currency whose `Amount != 1`, per
 * brief §32's explicit mandatory-test requirement (this provider must
 * pass the raw, un-normalized `Amount`/`Rate` through untouched; actual
 * normalization is `fxConversion.js#normalizeAmdPerUnit`'s job, proven
 * separately in `fxConversion.test.js`).
 */

import { describe, test, expect, jest } from '@jest/globals';
import { CbaExchangeRateProvider } from '../../../../src/modules/fx/providers/CbaExchangeRateProvider.js';
import { ExternalServiceError } from '../../../../src/errors/AppError.js';

function soapResponse({ currentDate = '2026-09-12T00:00:00+04:00', rates }) {
  const rateXml = rates
    .map(
      (r) =>
        `<ExchangeRate><ISO>${r.iso}</ISO><Amount>${r.amount}</Amount><Rate>${r.rate}</Rate><Difference>0</Difference></ExchangeRate>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ExchangeRatesLatestResponse xmlns="http://www.cba.am/">
      <ExchangeRatesLatestResult>
        <CurrentDate>${currentDate}</CurrentDate>
        <Rates>${rateXml}</Rates>
      </ExchangeRatesLatestResult>
    </ExchangeRatesLatestResponse>
  </soap:Body>
</soap:Envelope>`;
}

function fetchImplReturning(xml, { ok = true, status = 200 } = {}) {
  return jest.fn().mockResolvedValue({
    ok,
    status,
    text: async () => xml,
  });
}

describe('CbaExchangeRateProvider', () => {
  test('code is "cba"', () => {
    expect(
      new CbaExchangeRateProvider({ endpointUrl: 'https://api.cba.am/x' }).code,
    ).toBe('cba');
  });

  test('constructor requires an endpointUrl', () => {
    expect(() => new CbaExchangeRateProvider({})).toThrow(TypeError);
  });

  test('parses a real-shaped response, including a currency whose Amount != 1 (brief §32, mandatory)', async () => {
    const fetchImpl = fetchImplReturning(
      soapResponse({
        rates: [
          { iso: 'USD', amount: '1', rate: '363.28' },
          { iso: 'RUB', amount: '1', rate: '4.2971' },
          // JPY-style: CBA quotes per 10 units, not per 1 — the provider
          // must pass this through RAW (un-normalized), exactly as CBA
          // sent it.
          { iso: 'JPY', amount: '10', rate: '23.597' },
        ],
      }),
    );
    const provider = new CbaExchangeRateProvider({
      endpointUrl: 'https://api.cba.am/exchangerates.asmx',
      fetchImpl,
    });

    const result = await provider.fetchLatestRates();

    expect(result.currentDate).toBe('2026-09-12T00:00:00+04:00');
    expect(result.rates).toEqual([
      { iso: 'USD', amount: '1', rate: '363.28' },
      { iso: 'RUB', amount: '1', rate: '4.2971' },
      { iso: 'JPY', amount: '10', rate: '23.597' },
    ]);

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.cba.am/exchangerates.asmx');
    expect(options.method).toBe('POST');
    expect(options.headers.SOAPAction).toBe(
      '"http://www.cba.am/ExchangeRatesLatest"',
    );
  });

  test('a single-currency response (fast-xml-parser returns a bare object, not an array) still normalizes to a list', async () => {
    const fetchImpl = fetchImplReturning(
      soapResponse({ rates: [{ iso: 'USD', amount: '1', rate: '363.28' }] }),
    );
    const provider = new CbaExchangeRateProvider({
      endpointUrl: 'https://api.cba.am/exchangerates.asmx',
      fetchImpl,
    });

    const result = await provider.fetchLatestRates();
    expect(result.rates).toEqual([{ iso: 'USD', amount: '1', rate: '363.28' }]);
  });

  test('drops a malformed individual rate entry (zero/negative/non-numeric) rather than failing the whole batch', async () => {
    const xml = soapResponse({
      rates: [
        { iso: 'USD', amount: '1', rate: '363.28' },
        { iso: 'BAD1', amount: '0', rate: '10' },
        { iso: 'BAD2', amount: '1', rate: '-5' },
        { iso: 'BAD3', amount: '1', rate: 'not-a-number' },
      ],
    });
    const fetchImpl = fetchImplReturning(xml);
    const provider = new CbaExchangeRateProvider({
      endpointUrl: 'https://api.cba.am/exchangerates.asmx',
      fetchImpl,
    });

    const result = await provider.fetchLatestRates();
    expect(result.rates).toEqual([{ iso: 'USD', amount: '1', rate: '363.28' }]);
  });

  test('throws ExternalServiceError on a network failure', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const provider = new CbaExchangeRateProvider({
      endpointUrl: 'https://api.cba.am/exchangerates.asmx',
      fetchImpl,
    });
    await expect(provider.fetchLatestRates()).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
  });

  test('throws ExternalServiceError on a non-OK HTTP status', async () => {
    const fetchImpl = fetchImplReturning('', { ok: false, status: 503 });
    const provider = new CbaExchangeRateProvider({
      endpointUrl: 'https://api.cba.am/exchangerates.asmx',
      fetchImpl,
    });
    await expect(provider.fetchLatestRates()).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
  });

  test('throws ExternalServiceError on malformed (unparsable) XML', async () => {
    const fetchImpl = fetchImplReturning('<not-xml-at-all this is broken');
    const provider = new CbaExchangeRateProvider({
      endpointUrl: 'https://api.cba.am/exchangerates.asmx',
      fetchImpl,
    });
    await expect(provider.fetchLatestRates()).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
  });

  test('throws ExternalServiceError when the expected result element is missing', async () => {
    const fetchImpl = fetchImplReturning(
      '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><Unexpected/></soap:Body></soap:Envelope>',
    );
    const provider = new CbaExchangeRateProvider({
      endpointUrl: 'https://api.cba.am/exchangerates.asmx',
      fetchImpl,
    });
    await expect(provider.fetchLatestRates()).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
  });

  test('throws ExternalServiceError when every rate entry is unusable', async () => {
    const xml = soapResponse({
      rates: [{ iso: 'BAD', amount: '0', rate: '0' }],
    });
    const fetchImpl = fetchImplReturning(xml);
    const provider = new CbaExchangeRateProvider({
      endpointUrl: 'https://api.cba.am/exchangerates.asmx',
      fetchImpl,
    });
    await expect(provider.fetchLatestRates()).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
  });
});
