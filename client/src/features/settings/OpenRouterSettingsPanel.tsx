/**
 * ============================================================================
 * FILE: OpenRouterSettingsPanel.tsx
 * LOCATION: client/src/features/settings/OpenRouterSettingsPanel.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Collapsible settings panel for OpenRouter API key entry and model
 *    selection. Persists settings to localStorage and shows masked key
 *    display with a copy/reveal toggle.
 *
 * ROLE IN PROJECT:
 *    Rendered on LearningHome between the topic input and course dashboard.
 *    Provides the primary UI for configuring OpenRouter credentials before
 *    generating learning content.
 *
 * KEY COMPONENTS:
 *    - OpenRouterSettingsPanel: Collapsible card with key input + model picker
 *
 * DEPENDENCIES:
 *    - External: react, lucide-react, framer-motion
 *    - Internal: @/lib/openrouterSettings, @/lib/openrouterApi,
 *                ./OpenRouterModelPicker, @/lib/utils
 *
 * USAGE:
 *    ```tsx
 *    <OpenRouterSettingsPanel />
 *    ```
 * ============================================================================
 */

// OpenRouterSettingsPanel.tsx
// OpenRouter API key and model selection panel

import { useState, useCallback, useEffect } from 'react';
import { Settings, Eye, EyeOff, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import {
  getOpenRouterSettings,
  setOpenRouterSettings,
  clearOpenRouterSettings,
  maskApiKey,
} from '@/lib/openrouterSettings';
import { cn } from '@/lib/utils';
import { OpenRouterModelPicker } from './OpenRouterModelPicker';

export function OpenRouterSettingsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [modelTitle, setModelTitle] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [maskedDisplay, setMaskedDisplay] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Load saved settings on mount
  useEffect(() => {
    const saved = getOpenRouterSettings();
    if (saved.apiKey) {
      setApiKey(saved.apiKey);
      setMaskedDisplay(maskApiKey(saved.apiKey));
    }
    if (saved.model) {
      setModel(saved.model);
    }
    if (saved.modelTitle) {
      setModelTitle(saved.modelTitle);
    }
  }, []);

  const handleSaveKey = useCallback(() => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setValidationError('API key is required');
      return;
    }
    if (trimmed.length < 8) {
      setValidationError('API key appears too short');
      return;
    }
    setValidationError(null);
    setOpenRouterSettings({ apiKey: trimmed });
    setMaskedDisplay(maskApiKey(trimmed));
    setShowKey(false);
  }, [apiKey]);

  const handleClearKey = useCallback(() => {
    clearOpenRouterSettings();
    setApiKey('');
    setModel('');
    setModelTitle('');
    setMaskedDisplay('');
    setShowKey(false);
    setValidationError(null);
  }, []);

  const handleModelSelect = useCallback(
    (modelId: string, title: string) => {
      setModel(modelId);
      setModelTitle(title);
      setOpenRouterSettings({ model: modelId, modelTitle: title });
    },
    []
  );

  const isConfigured = Boolean(apiKey.trim());

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
        aria-controls="openrouter-settings"
      >
        <Settings className="h-4 w-4" />
        <span>
          {isConfigured && modelTitle
            ? `Using ${modelTitle}`
            : 'Configure OpenRouter'}
        </span>
      </button>

      {/* Settings panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="openrouter-settings"
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
              {/* API Key section */}
              <div className="mb-4">
                <label htmlFor="openrouter-api-key" className="block text-sm font-medium mb-1.5">
                  API Key
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      id="openrouter-api-key"
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        setValidationError(null);
                      }}
                      placeholder="sk-or-..."
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

                {/* Masked key display */}
                {isConfigured && !showKey && maskedDisplay && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Key: {maskedDisplay}
                  </p>
                )}
              </div>

              {/* Model picker */}
              <OpenRouterModelPicker
                apiKey={apiKey.trim()}
                value={model}
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
