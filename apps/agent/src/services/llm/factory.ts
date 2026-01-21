import { config } from '../../config/index.js';
import { MistralProvider } from './mistral.js';
import { ILLMProvider } from './types.js';

export type LLMProviderType = 'mistral';

export class LLMProviderFactory {
  private static instances: Map<string, ILLMProvider> = new Map();

  static getProvider(type: LLMProviderType = 'mistral'): ILLMProvider {
    const cached = this.instances.get(type);
    if (cached) return cached;

    let provider: ILLMProvider;

    switch (type) {
      case 'mistral':
        provider = new MistralProvider(config.MISTRAL_API_KEY);
        break;
      default:
        throw new Error(`Unsupported LLM provider: ${type}`);
    }

    this.instances.set(type, provider);
    return provider;
  }
}
