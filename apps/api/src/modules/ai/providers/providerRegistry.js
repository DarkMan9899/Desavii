/**
 * Provider Registry (Phase 15).
 *
 * Constructed once in `module.container.js` from `config.ai` — every
 * concrete `AIProvider` adapter is registered here, keyed by its own
 * `.code`. `AiService` is the only consumer; it never `new`s a provider
 * directly. Selecting an unregistered code, or a provider missing its
 * required config, both surface as a clear `ExternalServiceError` at
 * call time — never a boot-time crash (matches this codebase's
 * envalid-all-defaults convention).
 */

import { ExternalServiceError } from '../../../errors/AppError.js';
import { LocalHeuristicProvider } from './localHeuristicProvider.js';
import { OpenAiProvider } from './openAiProvider.js';
import { AnthropicProvider } from './anthropicProvider.js';
import { GeminiProvider } from './geminiProvider.js';
import { AzureOpenAiProvider } from './azureOpenAiProvider.js';
import { OllamaProvider } from './ollamaProvider.js';

const LOCAL_PROVIDER_CODE = new LocalHeuristicProvider().code;

export class ProviderRegistry {
  #providersByCode = new Map();

  #defaultProviderCode;

  constructor({ aiConfig }) {
    this.#defaultProviderCode = aiConfig.defaultProvider;
    this.#register(new LocalHeuristicProvider());
    this.#register(new OpenAiProvider(aiConfig.openai));
    this.#register(new AnthropicProvider(aiConfig.anthropic));
    this.#register(new GeminiProvider(aiConfig.gemini));
    this.#register(new AzureOpenAiProvider(aiConfig.azureOpenai));
    this.#register(new OllamaProvider(aiConfig.ollama));
  }

  #register(provider) {
    this.#providersByCode.set(provider.code, provider);
  }

  getProvider(code) {
    const provider = this.#providersByCode.get(code);
    if (!provider) {
      throw new ExternalServiceError(`Unknown AI provider "${code}".`);
    }
    return provider;
  }

  getDefaultProvider() {
    return this.getProvider(this.#defaultProviderCode);
  }

  /**
   * Whether the default provider is a real language model. The `local`
   * provider is a deterministic stand-in (templates and keyword rules, see
   * its own header), so features that present themselves to travellers as
   * AI must not offer themselves while it is the default.
   */
  isModelBacked() {
    return this.#defaultProviderCode !== LOCAL_PROVIDER_CODE;
  }
}

export default ProviderRegistry;
