import { describe, test, expect } from '@jest/globals';
import { ProviderRegistry } from '../../../../src/modules/ai/providers/providerRegistry.js';
import { ExternalServiceError } from '../../../../src/errors/AppError.js';

const AI_CONFIG = {
  defaultProvider: 'local',
  openai: { apiKey: '', model: 'gpt-4o-mini' },
  anthropic: { apiKey: '', model: 'claude-sonnet-5' },
  gemini: { apiKey: '', model: 'gemini-2.0-flash' },
  azureOpenai: {
    apiKey: '',
    endpoint: '',
    deployment: '',
    apiVersion: '2024-06-01',
  },
  ollama: { baseUrl: 'http://localhost:11434', model: 'llama3.1' },
};

describe('ProviderRegistry', () => {
  test('registers all six providers by their own .code', () => {
    const registry = new ProviderRegistry({ aiConfig: AI_CONFIG });
    expect(registry.getProvider('local').code).toBe('local');
    expect(registry.getProvider('openai').code).toBe('openai');
    expect(registry.getProvider('anthropic').code).toBe('anthropic');
    expect(registry.getProvider('gemini').code).toBe('gemini');
    expect(registry.getProvider('azure_openai').code).toBe('azure_openai');
    expect(registry.getProvider('ollama').code).toBe('ollama');
  });

  test('getDefaultProvider resolves from aiConfig.defaultProvider', () => {
    const registry = new ProviderRegistry({
      aiConfig: { ...AI_CONFIG, defaultProvider: 'ollama' },
    });
    expect(registry.getDefaultProvider().code).toBe('ollama');
  });

  test('isModelBacked is false for the deterministic local provider and true for a real model', () => {
    expect(new ProviderRegistry({ aiConfig: AI_CONFIG }).isModelBacked()).toBe(
      false,
    );
    expect(
      new ProviderRegistry({
        aiConfig: { ...AI_CONFIG, defaultProvider: 'anthropic' },
      }).isModelBacked(),
    ).toBe(true);
  });

  test('getProvider throws ExternalServiceError for an unknown code', () => {
    const registry = new ProviderRegistry({ aiConfig: AI_CONFIG });
    expect(() => registry.getProvider('does-not-exist')).toThrow(
      ExternalServiceError,
    );
  });

  test('a real provider selected without its API key fails at call time, not at construction', async () => {
    const registry = new ProviderRegistry({
      aiConfig: { ...AI_CONFIG, defaultProvider: 'openai' },
    });
    const provider = registry.getDefaultProvider();
    await expect(provider.complete({ messages: [] })).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
  });
});
