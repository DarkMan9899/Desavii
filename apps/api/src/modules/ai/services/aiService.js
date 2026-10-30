/**
 * AiService (Phase 15) — the single gateway every feature service and
 * controller talks to. Nothing outside this file ever imports a provider
 * adapter or a prompt module's raw output directly.
 *
 * Owns, in order, on every `complete()`/`stream()` call:
 *  1. Provider selection (`providerRegistry`, defaulting to
 *     `config.ai.defaultProvider` unless the caller asks for a specific
 *     `providerCode` — Admin AI's optional "AI-enhanced pass" is the one
 *     caller that does this).
 *  2. Redis response caching — `complete()` only, never `stream()` (a
 *     cached stream would defeat the point of streaming).
 *  3. Bounded exponential-backoff retry — only on `ExternalServiceError`
 *     (a transient provider/network failure); a validation-shaped error
 *     from a provider is never retried.
 *  4. Usage/token logging to `ai_usage_logs`, success or failure, so the
 *     Admin AI usage dashboard reflects real call volume including
 *     failures.
 *  5. Structured pino logging.
 */

import { ExternalServiceError } from '../../../errors/AppError.js';
import { getModuleLogger } from '../../../logging/logger.js';

const log = getModuleLogger('ai:service');

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class AiService {
  #providerRegistry;

  #aiCacheService;

  #aiUsageService;

  #maxRetries;

  constructor({
    providerRegistry,
    aiCacheService,
    aiUsageService,
    maxRetries = 2,
  }) {
    this.#providerRegistry = providerRegistry;
    this.#aiCacheService = aiCacheService;
    this.#aiUsageService = aiUsageService;
    this.#maxRetries = maxRetries;
  }

  /** What the AI layer can honestly offer right now — no provider names, models or keys. */
  getStatus() {
    return { modelBacked: this.#providerRegistry.isModelBacked() };
  }

  #resolveProvider(providerCode) {
    return providerCode
      ? this.#providerRegistry.getProvider(providerCode)
      : this.#providerRegistry.getDefaultProvider();
  }

  async #withRetry(fn) {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition -- bounded by the explicit break/throw below
    while (true) {
      try {
        // eslint-disable-next-line no-await-in-loop -- sequential retries by design
        return await fn();
      } catch (err) {
        const isTransient = err instanceof ExternalServiceError;
        if (!isTransient || attempt >= this.#maxRetries) {
          throw err;
        }
        attempt += 1;
        const backoffMs = 2 ** attempt * 200;
        log.warn(
          { err: err.message, attempt, backoffMs },
          'Retrying AI provider call',
        );
        // eslint-disable-next-line no-await-in-loop -- sequential retries by design
        await sleep(backoffMs);
      }
    }
  }

  /**
   * @param {object} params
   * @param {object|null} params.principal - for usage attribution only, never an authorization check (callers assert access themselves)
   * @param {string} params.featureCode
   * @param {Array<{role: string, content: string}>} params.messages
   * @param {number} [params.temperature]
   * @param {number} [params.maxTokens]
   * @param {string} [params.providerCode] - overrides `config.ai.defaultProvider` for this one call
   * @param {number|null} [params.partnerId]
   */
  async complete({
    principal,
    featureCode,
    messages,
    temperature,
    maxTokens,
    providerCode,
    partnerId = null,
  }) {
    const provider = this.#resolveProvider(providerCode);
    const cached = await this.#aiCacheService.get(
      featureCode,
      provider.code,
      messages,
    );
    if (cached) {
      await this.#aiUsageService.record({
        userId: principal?.userId ?? null,
        partnerId,
        featureCode,
        providerCode: provider.code,
        model: cached.model,
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: 0,
        cacheHit: true,
        succeeded: true,
      });
      return { ...cached, providerCode: provider.code, cacheHit: true };
    }

    const startedAt = Date.now();
    try {
      const result = await this.#withRetry(() =>
        provider.complete({ messages, temperature, maxTokens }),
      );
      const latencyMs = Date.now() - startedAt;
      await this.#aiCacheService.set(
        featureCode,
        provider.code,
        messages,
        result,
      );
      await this.#aiUsageService.record({
        userId: principal?.userId ?? null,
        partnerId,
        featureCode,
        providerCode: provider.code,
        model: result.model,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        latencyMs,
        cacheHit: false,
        succeeded: true,
      });
      return { ...result, providerCode: provider.code, cacheHit: false };
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      await this.#aiUsageService.record({
        userId: principal?.userId ?? null,
        partnerId,
        featureCode,
        providerCode: provider.code,
        latencyMs,
        cacheHit: false,
        succeeded: false,
      });
      log.error(
        { err, featureCode, providerCode: provider.code },
        'AI completion failed',
      );
      throw err;
    }
  }

  /**
   * Streaming is never cached and never retried mid-stream (a partially
   * yielded response can't be safely replayed) — a failure before the
   * first chunk still surfaces as a normal thrown error the caller's SSE
   * route can turn into an error event.
   */
  async *stream({
    principal,
    featureCode,
    messages,
    temperature,
    maxTokens,
    providerCode,
    partnerId = null,
  }) {
    const provider = this.#resolveProvider(providerCode);
    const startedAt = Date.now();
    let usage = { promptTokens: 0, completionTokens: 0 };
    let model = null;
    let succeeded = true;
    try {
      for await (const chunk of provider.stream({
        messages,
        temperature,
        maxTokens,
      })) {
        if (chunk.usage) usage = chunk.usage;
        if (chunk.model) model = chunk.model;
        yield chunk;
      }
    } catch (err) {
      succeeded = false;
      log.error(
        { err, featureCode, providerCode: provider.code },
        'AI stream failed',
      );
      throw err;
    } finally {
      const latencyMs = Date.now() - startedAt;
      await this.#aiUsageService.record({
        userId: principal?.userId ?? null,
        partnerId,
        featureCode,
        providerCode: provider.code,
        model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        latencyMs,
        cacheHit: false,
        succeeded,
      });
    }
  }
}

export default AiService;
