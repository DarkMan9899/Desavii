/**
 * FX module response DTO — Pass 8 (Multi-Currency / CBA FX Pricing).
 *
 * Shape matches brief §13 exactly: `{baseCurrency, rates, effectiveAt,
 * source}`. `rates` keys are ISO codes (including the base itself, so a
 * client never has to special-case "no conversion needed for my own
 * currency"); values are the normalized "AMD per 1 unit" decimal strings
 * `exchangeRateService.js` already produces — the frontend divides by
 * these, it never re-derives or re-normalizes them.
 */

export function toFxRatesResponse(result) {
  return {
    baseCurrency: result.baseCurrency,
    rates: result.rates,
    effectiveAt: result.effectiveAt,
    source: result.source,
  };
}

export default toFxRatesResponse;
