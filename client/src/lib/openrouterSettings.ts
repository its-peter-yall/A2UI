/**
 * ============================================================================
 * FILE: openrouterSettings.ts
 * LOCATION: client/src/lib/openrouterSettings.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Manages OpenRouter API key and model selection persistence via
 *    localStorage. Provides safe read/write/clear operations and a
 *    key-masking helper for display purposes.
 *
 * ROLE IN PROJECT:
 *    Single source of truth for client-side OpenRouter configuration.
 *    Used by the settings UI, model picker, and Axios interceptors to
 *    attach authentication headers to backend requests.
 *
 * KEY COMPONENTS:
 *    - OpenRouterSettings: Typed settings object shape
 *    - getOpenRouterSettings(): Reads settings from localStorage safely
 *    - setOpenRouterSettings(): Partially updates settings in localStorage
 *    - clearOpenRouterSettings(): Removes all OpenRouter settings
 *    - maskApiKey(): Masks API key for safe display (e.g., "sk-...abcd")
 *
 * DEPENDENCIES:
 *    - External: (none)
 *    - Internal: (none)
 *
 * USAGE:
 *    ```ts
 *    import { getOpenRouterSettings, setOpenRouterSettings, maskApiKey } from '@/lib/openrouterSettings';
 *    setOpenRouterSettings({ apiKey: 'sk-or-...' });
 *    const settings = getOpenRouterSettings();
 *    console.log(maskApiKey(settings.apiKey)); // "sk-or-...abcd"
 *    ```
 * ============================================================================
 */

// openrouterSettings.ts
// localStorage-backed OpenRouter configuration

const STORAGE_KEY = 'openrouter_settings';

export interface OpenRouterSettings {
  apiKey: string;
  model: string;
  modelTitle: string;
}

const EMPTY_SETTINGS: OpenRouterSettings = {
  apiKey: '',
  model: '',
  modelTitle: '',
};

/**
 * Reads OpenRouter settings from localStorage.
 * Returns empty defaults if nothing is stored or parsing fails.
 */
export function getOpenRouterSettings(): OpenRouterSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...EMPTY_SETTINGS };
    }
    const parsed = JSON.parse(raw) as Partial<OpenRouterSettings>;
    return {
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      model: typeof parsed.model === 'string' ? parsed.model : '',
      modelTitle: typeof parsed.modelTitle === 'string' ? parsed.modelTitle : '',
    };
  } catch {
    return { ...EMPTY_SETTINGS };
  }
}

/**
 * Partially updates OpenRouter settings in localStorage.
 * Merges with existing settings so callers can update individual fields.
 */
export function setOpenRouterSettings(
  partial: Partial<OpenRouterSettings>
): void {
  const current = getOpenRouterSettings();
  const merged = { ...current, ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
}

/**
 * Removes all OpenRouter settings from localStorage.
 */
export function clearOpenRouterSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Masks an API key for safe display.
 * Shows only the last 4 characters: "sk-or-...abcd"
 * Returns empty string for empty/falsy input.
 */
export function maskApiKey(key: string | undefined | null): string {
  if (!key || key.length < 8) {
    return '';
  }
  const suffix = key.slice(-4);
  return `${key.slice(0, 6)}...${suffix}`;
}
