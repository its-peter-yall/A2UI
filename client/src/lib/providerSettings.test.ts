/**
 * ============================================================================
 * FILE: providerSettings.test.ts
 * LOCATION: client/src/lib/providerSettings.test.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for providerSettings localStorage module.
 *
 * ROLE IN PROJECT:
 *    Ensures robust settings loading, switching, clearing, key masking,
 *    and legacy migration logic.
 *
 * KEY COMPONENTS:
 *    - Default state tests
 *    - CRUD and Active Provider selection tests
 *    - Legacy settings migration tests
 *    - Edge case key masking tests
 *    - Corrupt JSON/data recovery tests
 *
 * DEPENDENCIES:
 *    - External: vitest
 *    - Internal: @/lib/providerSettings
 *
 * USAGE:
 *    npm run test -- providerSettings.test.ts
 * ============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getProviderSettings,
  setProviderSettings,
  getActiveProviderConfig,
  setActiveProvider,
  setProviderConfig,
  clearProviderConfig,
  maskApiKey,
} from './providerSettings';

const STORAGE_KEY = 'ai_provider_settings';
const LEGACY_STORAGE_KEY = 'openrouter_settings';

describe('providerSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getProviderSettings', () => {
    it('returns empty defaults when localStorage is empty', () => {
      const settings = getProviderSettings();
      expect(settings).toEqual({
        activeProvider: 'openrouter',
        providers: {
          openrouter: { apiKey: '', model: '', modelTitle: '' },
          generalcompute: { apiKey: '', model: '', modelTitle: '' },
        },
      });
    });

    it('reads valid settings from localStorage', () => {
      const mockSettings = {
        activeProvider: 'generalcompute',
        providers: {
          openrouter: { apiKey: 'sk-or-123', model: 'gpt-4', modelTitle: 'GPT-4' },
          generalcompute: { apiKey: 'gc-456', model: 'gc-large', modelTitle: 'GC Large' },
        },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockSettings));

      const settings = getProviderSettings();
      expect(settings.activeProvider).toBe('generalcompute');
      expect(settings.providers.openrouter.apiKey).toBe('sk-or-123');
      expect(settings.providers.generalcompute.apiKey).toBe('gc-456');
    });

    it('returns defaults for corrupted JSON', () => {
      localStorage.setItem(STORAGE_KEY, 'invalid-json-{');
      const settings = getProviderSettings();
      expect(settings.activeProvider).toBe('openrouter');
      expect(settings.providers.openrouter.apiKey).toBe('');
    });
  });

  describe('setProviderSettings / setProviderConfig', () => {
    it('saves custom provider settings correctly', () => {
      setProviderConfig('openrouter', { apiKey: 'sk-test-key', model: 'model-a' });
      const settings = getProviderSettings();
      expect(settings.providers.openrouter.apiKey).toBe('sk-test-key');
      expect(settings.providers.openrouter.model).toBe('model-a');
      expect(settings.providers.generalcompute.apiKey).toBe('');
    });

    it('partially updates configuration without losing other fields', () => {
      setProviderConfig('openrouter', { apiKey: 'first-key', model: 'first-model' });
      setProviderConfig('openrouter', { model: 'second-model' });
      
      const settings = getProviderSettings();
      expect(settings.providers.openrouter.apiKey).toBe('first-key');
      expect(settings.providers.openrouter.model).toBe('second-model');
    });
  });

  describe('setActiveProvider', () => {
    it('switches and persists the active provider', () => {
      setActiveProvider('generalcompute');
      const settings = getProviderSettings();
      expect(settings.activeProvider).toBe('generalcompute');
      expect(getActiveProviderConfig()).toEqual(settings.providers.generalcompute);
    });
  });

  describe('clearProviderConfig', () => {
    it('clears only the target provider settings', () => {
      setProviderConfig('openrouter', { apiKey: 'sk-or' });
      setProviderConfig('generalcompute', { apiKey: 'gc-key' });

      clearProviderConfig('generalcompute');

      const settings = getProviderSettings();
      expect(settings.providers.generalcompute.apiKey).toBe('');
      expect(settings.providers.openrouter.apiKey).toBe('sk-or');
    });
  });

  describe('Legacy migration', () => {
    it('migrates legacy openrouter_settings correctly and clears the legacy key', () => {
      const legacyData = {
        apiKey: 'legacy-sk-or',
        model: 'legacy-model',
        modelTitle: 'Legacy Model',
      };
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacyData));

      const settings = getProviderSettings();
      expect(settings.activeProvider).toBe('openrouter');
      expect(settings.providers.openrouter.apiKey).toBe('legacy-sk-or');
      expect(settings.providers.openrouter.model).toBe('legacy-model');
      expect(settings.providers.openrouter.modelTitle).toBe('Legacy Model');
      expect(settings.providers.generalcompute.apiKey).toBe('');

      expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    });
  });

  describe('maskApiKey', () => {
    it('masks normal keys showing prefix and last 4 characters', () => {
      expect(maskApiKey('sk-or-1234567890')).toBe('sk-or-...7890');
    });

    it('returns empty string for empty, null, or undefined keys', () => {
      expect(maskApiKey('')).toBe('');
      expect(maskApiKey(null)).toBe('');
      expect(maskApiKey(undefined)).toBe('');
    });

    it('returns empty string for very short keys', () => {
      expect(maskApiKey('sk-or')).toBe('');
    });
  });
});
