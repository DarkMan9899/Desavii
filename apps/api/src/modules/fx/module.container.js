/**
 * FX module DI container — Pass 8 (Multi-Currency / CBA FX Pricing).
 *
 * Self-contained: no dependency on any other module's Service (mirrors
 * `contact/module.container.js`'s rationale) — FX rates are a pure
 * reference concept, not owned by or scoped to any other domain.
 * `config.fx.provider` already resolves to `'fixture'` under
 * `NODE_ENV=test` (see `config/index.js`), so this container never needs
 * its own test-environment branch — it just asks `config` which provider
 * to build, same as every other provider-backed module
 * (`ai`/`payments`) already does.
 */

import { CbaExchangeRateProvider } from './providers/CbaExchangeRateProvider.js';
import { FixtureExchangeRateProvider } from './providers/FixtureExchangeRateProvider.js';
import { MySqlExchangeRateRepository } from './repositories/mysqlExchangeRateRepository.js';
import { ExchangeRateService } from './services/exchangeRateService.js';
import { createFxController } from './controllers/fxController.js';
import config from '../../config/index.js';

function createProvider() {
  if (config.fx.provider === 'fixture') {
    return new FixtureExchangeRateProvider();
  }
  return new CbaExchangeRateProvider({
    endpointUrl: config.fx.cbaExchangeRateUrl,
    timeoutMs: config.fx.httpTimeoutMs,
  });
}

export default function createFxContainer() {
  const provider = createProvider();
  const exchangeRateRepository = new MySqlExchangeRateRepository();
  const exchangeRateService = new ExchangeRateService({
    provider,
    exchangeRateRepository,
    cacheTtlSeconds: config.fx.rateCacheTtlSeconds,
  });
  const fxController = createFxController(exchangeRateService);

  return {
    exchangeRateRepository,
    exchangeRateService,
    fxController,
  };
}
