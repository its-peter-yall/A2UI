/**
 * ============================================================================
 * FILE: openrouterSettings.test.ts
 * LOCATION: client/src/lib/openrouterSettings.test.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for the OpenRouter settings localStorage module.
 *
 * ROLE IN PROJECT:
 *    Verifies read/write/clear/mask behavior in a jsdom environment to
 *    ensure settings persistence works correctly across page reloads.
 *
 * DEPENDENCIES:
 *    - External: vitest
 *    - Internal: ./openrouterSettings
 *
 * USAGE:
 *    npm run test -- openrouterSettings.test.ts
 * ============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getOpenRouterSettings,
  setOpenRouterSettings,
  clearOpenRouterSettings,
  maskApiKey,
} from './openrouterSettings';

const STORAGE_KEY = 'openrouter_settings';

describe('openrouterSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getOpenRouterSettings', () => {
    it('returns empty defaults when localStorage is empty', () => {
      const settings = getOpenRouterSettings();
      expect(settings).toEqual({
        apiKey: '',
        model: '',
        modelTitle: '',
      });
    });

    it('reads valid JSON from localStorage', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          apiKey: 'sk-or-test1234',
          model: 'openai/gpt-4o',
          modelTitle: 'GPT-4o',
        })
      );

      const settings = getOpenRouterSettings();
      expect(settings.apiKey).toBe('sk-or-test1234');
      expect(settings.model).toBe('openai/gpt-4o');
      expect(settings.modelTitle).toBe('GPT-4o');
    });

    it('returns defaults for corrupted JSON', () => {
      localStorage.setItem(STORAGE_KEY, 'not-json{{{');
      const settings = getOpenRouterSettings();
      expect(settings).toEqual({
        apiKey: '',
        model: '',
        modelTitle: '',
      });
    });

    it('returns defaults for partial objects missing fields', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey: 'sk-or-abc' }));
      const settings = getOpenRouterSettings();
      expect(settings.apiKey).toBe('sk-or-abc');
      expect(settings.model).toBe('');
      expect(settings.modelTitle).toBe('');
    });
  });

  describe('setOpenRouterSettings', () => {
    it('writes settings to localStorage', () => {
      setOpenRouterSettings({
        apiKey: 'sk-or-new-key',
        model: 'anthropic/claude-3',
        modelTitle: 'Claude 3',
      });

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.apiKey).toBe('sk-or-new-key');
      expect(stored.model).toBe('anthropic/claude-3');
      expect(stored.modelTitle).toBe('Claude 3');
    });

    it('partially updates existing settings', () => {
      setOpenRouterSettings({ apiKey: 'sk-or-first' });
      setOpenRouterSettings({ model: 'openai/gpt-4o' });

      const settings = getOpenRouterSettings();
      expect(settings.apiKey).toBe('sk-or-first');
      expect(settings.model).toBe('openai/gpt-4o');
    });
  });

  describe('clearOpenRouterSettings', () => {
    it('removes settings from localStorage', () => {
      setOpenRouterSettings({ apiKey: 'sk-or-to-clear' });
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

      clearOpenRouterSettings();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('getOpenRouterSettings returns defaults after clear', () => {
      setOpenRouterSettings({ apiKey: 'sk-or-something' });
      clearOpenRouterSettings();

      const settings = getOpenRouterSettings();
      expect(settings).toEqual({
        apiKey: '',
        model: '',
        modelTitle: '',
      });
    });
  });

  describe('maskApiKey', () => {
    it('masks a standard key showing prefix and last 4 chars', () => {
      const masked = maskApiKey('sk-or-abc123456789');
      expect(masked).toBe('sk-or-...6789');
    });

    it('returns empty string for empty input', () => {
      expect(maskApiKey('')).toBe('');
      expect(maskApiKey(null)).toBe('');
      expect(maskApiKey(undefined)).toBe('');
    });

    it('returns empty string for keys shorter than 8 chars', () => {
      expect(maskApiKey('short')).toBe('');
      expect(maskApiKey('1234567')).toBe('');
    });

    it('handles exactly 8-char key', () => {
      expect(maskApiKey('12345678')).toBe('123456...5678');
    });
  });
});
