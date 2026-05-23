/**
 * ============================================================================
 * FILE: providerSettings.ts
 * LOCATION: client/src/lib/providerSettings.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Manages multi-provider (OpenRouter, General Compute) settings in
 *    localStorage.
 *
 * ROLE IN PROJECT:
 *    Provides read/write/clear/mask capabilities for provider-specific API keys
 *    and model selections. Seamlessly migrates legacy OpenRouter settings on first access.
 *
 * KEY COMPONENTS:
 *    - ProviderConfig: Per-provider API key and model selection structure
 *    - AIProviderSettings: Registry-wide active provider and configuration mapping
 *    - getProviderSettings(): Safe load with legacy migration logic
 *    - setProviderSettings(): Merge and persist settings
 *    - getActiveProviderConfig(): Shorthand to active provider's config
 *    - setProviderConfig(): Update a specific provider's configuration
 *    - clearProviderConfig(): Reset a specific provider's configuration
 *
 * DEPENDENCIES:
 *    - External: None
 *    - Internal: @/types/provider
 *
 * USAGE:
 *    import { getProviderSettings, setProviderConfig } from '@/lib/providerSettings';
 * ============================================================================
 */

import type { AIProvider } from '@/types/provider';

const STORAGE_KEY = 'ai_provider_settings';
const LEGACY_STORAGE_KEY = 'openrouter_settings';

export interface ProviderConfig {
  apiKey: string;
  model: string;
  modelTitle: string;
}

export interface AIProviderSettings {
  activeProvider: AIProvider;
  providers: Record<AIProvider, ProviderConfig>;
}

const EMPTY_CONFIG: ProviderConfig = {
  apiKey: '',
  model: '',
  modelTitle: '',
};

const EMPTY_SETTINGS: AIProviderSettings = {
  activeProvider: 'openrouter',
  providers: {
    openrouter: { ...EMPTY_CONFIG },
    generalcompute: { ...EMPTY_CONFIG },
  },
};

/**
 * Reads settings from localStorage, migrating legacy OpenRouter settings if present.
 */
export function getProviderSettings(): AIProviderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AIProviderSettings>;
      return {
        activeProvider: parsed?.activeProvider === 'generalcompute' ? 'generalcompute' : 'openrouter',
        providers: {
          openrouter: {
            apiKey: typeof parsed?.providers?.openrouter?.apiKey === 'string' ? parsed.providers.openrouter.apiKey : '',
            model: typeof parsed?.providers?.openrouter?.model === 'string' ? parsed.providers.openrouter.model : '',
            modelTitle: typeof parsed?.providers?.openrouter?.modelTitle === 'string' ? parsed.providers.openrouter.modelTitle : '',
          },
          generalcompute: {
            apiKey: typeof parsed?.providers?.generalcompute?.apiKey === 'string' ? parsed.providers.generalcompute.apiKey : '',
            model: typeof parsed?.providers?.generalcompute?.model === 'string' ? parsed.providers.generalcompute.model : '',
            modelTitle: typeof parsed?.providers?.generalcompute?.modelTitle === 'string' ? parsed.providers.generalcompute.modelTitle : '',
          },
        },
      };
    }

    // Try reading legacy format
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacyParsed = JSON.parse(legacyRaw) as { apiKey?: string; model?: string; modelTitle?: string };
      const migrated: AIProviderSettings = {
        activeProvider: 'openrouter',
        providers: {
          openrouter: {
            apiKey: typeof legacyParsed.apiKey === 'string' ? legacyParsed.apiKey : '',
            model: typeof legacyParsed.model === 'string' ? legacyParsed.model : '',
            modelTitle: typeof legacyParsed.modelTitle === 'string' ? legacyParsed.modelTitle : '',
          },
          generalcompute: { ...EMPTY_CONFIG },
        },
      };
      // Save migrated data & cleanup legacy
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return migrated;
    }

    return {
      activeProvider: 'openrouter',
      providers: {
        openrouter: { ...EMPTY_CONFIG },
        generalcompute: { ...EMPTY_CONFIG },
      },
    };
  } catch {
    return {
      activeProvider: 'openrouter',
      providers: {
        openrouter: { ...EMPTY_CONFIG },
        generalcompute: { ...EMPTY_CONFIG },
      },
    };
  }
}

/**
 * Partially updates settings in localStorage, merging with existing values.
 */
export function setProviderSettings(partial: Partial<AIProviderSettings>): void {
  const current = getProviderSettings();
  const merged: AIProviderSettings = {
    activeProvider: partial.activeProvider !== undefined ? partial.activeProvider : current.activeProvider,
    providers: {
      openrouter: partial.providers?.openrouter 
        ? { ...current.providers.openrouter, ...partial.providers.openrouter }
        : current.providers.openrouter,
      generalcompute: partial.providers?.generalcompute 
        ? { ...current.providers.generalcompute, ...partial.providers.generalcompute }
        : current.providers.generalcompute,
    },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
}

/**
 * Returns configuration for the active provider.
 */
export function getActiveProviderConfig(): ProviderConfig {
  const settings = getProviderSettings();
  return settings.providers[settings.activeProvider];
}

/**
 * Sets the active AI provider.
 */
export function setActiveProvider(provider: AIProvider): void {
  setProviderSettings({ activeProvider: provider });
}

/**
 * Updates a specific provider's configuration.
 */
export function setProviderConfig(
  provider: AIProvider,
  config: Partial<ProviderConfig>
): void {
  const settings = getProviderSettings();
  const updatedProviders = {
    ...settings.providers,
    [provider]: {
      ...settings.providers[provider],
      ...config,
    },
  };
  setProviderSettings({ providers: updatedProviders });
}

/**
 * Resets a specific provider's configuration.
 */
export function clearProviderConfig(provider: AIProvider): void {
  setProviderConfig(provider, { ...EMPTY_CONFIG });
}

/**
 * Masks an API key for safe display.
 */
export function maskApiKey(key: string | undefined | null): string {
  if (!key || key.length < 8) {
    return '';
  }
  const suffix = key.slice(-4);
  return `${key.slice(0, 6)}...${suffix}`;
}
