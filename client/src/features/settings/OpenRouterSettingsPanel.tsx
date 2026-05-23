/**
 * ============================================================================
 * FILE: OpenRouterSettingsPanel.tsx
 * LOCATION: client/src/features/settings/OpenRouterSettingsPanel.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Collapsible settings panel supporting multi-provider configuration
 *    (OpenRouter and General Compute) with secure key entry and model picker.
 *
 * ROLE IN PROJECT:
 *    Primary settings UI for the learning module. Manages independent provider
 *    keys and models and updates the active provider.
 *
 * KEY COMPONENTS:
 *    - OpenRouterSettingsPanel: The main collapsible component
 *    - Tab selector for switching between active providers
 *    - ModelPicker integration with filtered lists
 *
 * DEPENDENCIES:
 *    - External: react, lucide-react, framer-motion
 *    - Internal: @/lib/providerSettings, @/features/settings/ModelPicker,
 *                @/lib/utils
 *
 * USAGE:
 *    import { OpenRouterSettingsPanel } from './OpenRouterSettingsPanel';
 * ============================================================================
 */

import { useState, useCallback } from 'react';
import { Settings, Eye, EyeOff, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import {
  getProviderSettings,
  updateProviderConfig,
  setActiveProvider,
  clearProviderConfig,
} from '@/lib/providerSettings';
import type { AIProvider } from '@/types/provider';
import { ModelPicker } from './ModelPicker';
import { cn } from '@/lib/utils';

export function OpenRouterSettingsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState(() => getProviderSettings());
  const [showKey, setShowKey] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const activeProvider = settings.activeProvider;
  const activeConfig = settings.providers[activeProvider];

  const handleProviderChange = useCallback((provider: AIProvider) => {
    setActiveProvider(provider);
    setSettings(getProviderSettings());
    setValidationError(null);
    setShowKey(false);
  }, []);

  const handleKeyChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      updateProviderConfig(activeProvider, { apiKey: val });
      setSettings(getProviderSettings());
      setValidationError(null);
    },
    [activeProvider]
  );

  const handleSaveKey = useCallback(() => {
    const trimmed = activeConfig.apiKey.trim();
    if (!trimmed) {
      setValidationError('API key is required');
      return;
    }
    if (trimmed.length < 8) {
      setValidationError('API key appears too short');
      return;
    }
    setValidationError(null);
    setShowKey(false);
  }, [activeConfig.apiKey]);

  const handleClearKey = useCallback(() => {
    clearProviderConfig(activeProvider);
    setSettings(getProviderSettings());
    setShowKey(false);
    setValidationError(null);
  }, [activeProvider]);

  const handleModelSelect = useCallback(
    (modelId: string, title: string) => {
      updateProviderConfig(activeProvider, {
        model: modelId,
        modelTitle: title,
      });
      setSettings(getProviderSettings());
    },
    [activeProvider]
  );

  const isConfigured = Boolean(activeConfig.apiKey.trim());

  return (
    <div className="w-full max-w-lg mx-auto mb-8">
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          'flex items-center gap-2 text-sm transition-colors mx-auto',
          'text-muted-foreground hover:text-foreground',
          'focus:outline-none focus:ring-2 focus:ring-yellow-400/50 rounded-md px-2 py-1',
          isConfigured && 'text-yellow-400 hover:text-yellow-300'
        )}
        aria-expanded={isOpen}
        aria-controls="provider-settings-panel"
      >
        <Settings className="h-4 w-4" />
        <span>
          {isConfigured && activeConfig.modelTitle
            ? `Using ${activeConfig.modelTitle} (${activeProvider === 'openrouter' ? 'OpenRouter' : 'General Compute'})`
            : 'Configure AI Provider'}
        </span>
      </button>

      {/* Settings panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="provider-settings-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div
              className={cn(
                'mt-3 p-4 rounded-xl',
                'bg-white/5 border border-white/10 backdrop-blur-md'
              )}
            >
              {/* Provider Tabs */}
              <div className="flex border-b border-white/10 mb-4">
                <button
                  type="button"
                  onClick={() => handleProviderChange('openrouter')}
                  className={cn(
                    'flex-1 pb-2 text-sm font-medium border-b-2 transition-colors',
                    activeProvider === 'openrouter'
                      ? 'border-yellow-400 text-yellow-400'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  OpenRouter
                </button>
                <button
                  type="button"
                  onClick={() => handleProviderChange('generalcompute')}
                  className={cn(
                    'flex-1 pb-2 text-sm font-medium border-b-2 transition-colors',
                    activeProvider === 'generalcompute'
                      ? 'border-yellow-400 text-yellow-400'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  General Compute
                </button>
              </div>

              {/* API Key section */}
              <div className="mb-4">
                <label
                  htmlFor="provider-api-key"
                  className="block text-sm font-medium mb-1.5"
                >
                  API Key
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      id="provider-api-key"
                      type={showKey ? 'text' : 'password'}
                      value={activeConfig.apiKey}
                      onChange={handleKeyChange}
                      placeholder={
                        activeProvider === 'openrouter'
                          ? 'sk-or-...'
                          : 'Enter General Compute API key'
                      }
                      className={cn(
                        'w-full rounded-lg px-3 py-2 pr-9 text-sm',
                        'bg-white/5 border text-foreground',
                        'placeholder:text-muted-foreground',
                        'focus:outline-none focus:ring-2 focus:ring-yellow-400/50',
                        validationError
                          ? 'border-red-400/50'
                          : 'border-white/10'
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showKey ? 'Hide key' : 'Show key'}
                    >
                      {showKey ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveKey}
                    aria-label="Save API key"
                    className={cn(
                      'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      'bg-[#FFD400] text-black hover:bg-[#FFD400]/90',
                      'focus:outline-none focus:ring-2 focus:ring-yellow-400/50'
                    )}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  {isConfigured && (
                    <button
                      type="button"
                      onClick={handleClearKey}
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm transition-colors',
                        'bg-white/5 border border-white/10 text-muted-foreground',
                        'hover:text-foreground hover:border-white/20',
                        'focus:outline-none focus:ring-2 focus:ring-red-400/50'
                      )}
                      aria-label="Clear API key"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Validation error */}
                {validationError && (
                  <p className="mt-1.5 text-xs text-red-400">
                    {validationError}
                  </p>
                )}

                {/* Key saved confirmation */}
                {isConfigured && !showKey && (
                  <p className="mt-1.5 text-xs text-green-400 flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    Key saved
                  </p>
                )}
              </div>

              {/* Model picker */}
              <ModelPicker
                provider={activeProvider}
                apiKey={activeConfig.apiKey.trim()}
                value={activeConfig.model}
                onSelect={handleModelSelect}
                disabled={!isConfigured}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
