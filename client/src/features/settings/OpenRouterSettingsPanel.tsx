/**
 * ============================================================================
 * FILE: OpenRouterSettingsPanel.tsx
 * LOCATION: client/src/features/settings/OpenRouterSettingsPanel.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    AI provider configuration panel presenting OpenRouter and General Compute
 *    credentials as collapsible dropdown accordion cards with a unified model picker.
 *
 * ROLE IN PROJECT:
 *    Provides the primary interface for managing API keys and selecting models.
 *    Displays both providers concurrently as collapsible drawers, keeping their
 *    states and verification workflows independent.
 *
 * KEY COMPONENTS:
 *    - OpenRouterSettingsPanel: Main credentials layout and model picker container
 *    - Unified ModelPicker: Top slot dropdown displaying all valid provider models
 *    - Interactive accordion headers for OpenRouter and General Compute key entries
 *
 * DEPENDENCIES:
 *    - External: react, lucide-react, framer-motion
 *    - Internal: @/lib/providerSettings, @/features/settings/ModelPicker, @/lib/utils, @/lib/providerApi
 *
 * USAGE:
 *    import { OpenRouterSettingsPanel } from './OpenRouterSettingsPanel';
 *    <OpenRouterSettingsPanel />
 * ============================================================================
 */

import { useState, useCallback } from 'react';
import { Eye, EyeOff, Check, X, CheckCheck, Globe, Cpu, AlertTriangle, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import {
  getProviderSettings,
  setProviderConfig,
  setActiveProvider,
  clearProviderConfig,
} from '@/lib/providerSettings';
import { getProviderModels } from '@/lib/providerApi';
import type { AIProvider } from '@/types/provider';
import { ModelPicker } from './ModelPicker';
import { cn } from '@/lib/utils';

export function OpenRouterSettingsPanel() {
  const [settings, setSettings] = useState(() => getProviderSettings());
  
  // Independent API key visibility states
  const [showORKey, setShowORKey] = useState(false);
  const [showGCKey, setShowGCKey] = useState(false);

  // Independent error states
  const [orError, setOrError] = useState<string | null>(null);
  const [gcError, setGcError] = useState<string | null>(null);

  // Independent verification loading states
  const [isORVerifying, setIsORVerifying] = useState(false);
  const [isGCVerifying, setIsGCVerifying] = useState(false);

  // Initial key checks for display indicators
  const orKeyInit = settings.providers.openrouter.apiKey.trim();
  const gcKeyInit = settings.providers.generalcompute.apiKey.trim();

  // Independent success feedback states
  const [orSuccess, setOrSuccess] = useState<boolean | null>(
    orKeyInit ? true : null
  );
  const [gcSuccess, setGcSuccess] = useState<boolean | null>(
    gcKeyInit ? true : null
  );

  // Independent deduplication values
  const [lastORKey, setLastORKey] = useState(orKeyInit);
  const [lastGCKey, setLastGCKey] = useState(gcKeyInit);

  // Accordion open/close toggle states
  // Default to open if key is empty or if it is the active provider
  const [isOROpen, setIsOROpen] = useState(
    () => !orKeyInit || settings.activeProvider === 'openrouter'
  );
  const [isGCOpen, setIsGCOpen] = useState(
    () => !gcKeyInit || settings.activeProvider === 'generalcompute'
  );

  // Individual handlers for API key modifications
  const handleKeyChange = useCallback((provider: AIProvider, value: string) => {
    setProviderConfig(provider, { apiKey: value });
    setSettings(getProviderSettings());
    if (provider === 'openrouter') {
      setOrError(null);
      setOrSuccess(null);
    } else {
      setGcError(null);
      setGcSuccess(null);
    }
  }, []);

  const handleSaveAndVerify = useCallback(
    async (provider: AIProvider) => {
      const isOR = provider === 'openrouter';
      const config = settings.providers[provider];
      const trimmed = config.apiKey.trim();

      const setError = isOR ? setOrError : setGcError;
      const setSuccess = isOR ? setOrSuccess : setGcSuccess;
      const setVerifying = isOR ? setIsORVerifying : setIsGCVerifying;
      const lastKey = isOR ? lastORKey : lastGCKey;
      const setLastKey = isOR ? setLastORKey : setLastGCKey;

      if (!trimmed) {
        setError('API key is required');
        setSuccess(false);
        return;
      }
      if (trimmed.length < 8) {
        setError('API key appears too short');
        setSuccess(false);
        return;
      }

      // Deduplicate if already validated successfully
      if (trimmed === lastKey && (isOR ? orSuccess : gcSuccess) === true) {
        return;
      }

      setVerifying(true);
      setError(null);
      setSuccess(null);

      try {
        // Validate with remote catalogs
        await getProviderModels(provider, trimmed);

        // Persist on success
        setProviderConfig(provider, { apiKey: trimmed });
        setSettings(getProviderSettings());

        setSuccess(true);
        setLastKey(trimmed);
        setError(null);
        if (isOR) setShowORKey(false);
        else setShowGCKey(false);
      } catch (error) {
        setSuccess(false);
        if (error instanceof Error) {
          setError(error.message);
        } else {
          setError('Failed to verify API key');
        }
      } finally {
        setVerifying(false);
      }
    },
    [settings, lastORKey, lastGCKey, orSuccess, gcSuccess]
  );

  const handleClearKey = useCallback((provider: AIProvider) => {
    clearProviderConfig(provider);
    setSettings(getProviderSettings());
    if (provider === 'openrouter') {
      setShowORKey(false);
      setOrError(null);
      setOrSuccess(null);
      setLastORKey('');
    } else {
      setShowGCKey(false);
      setGcError(null);
      setGcSuccess(null);
      setLastGCKey('');
    }
  }, []);

  const handleModelSelect = useCallback((provider: AIProvider, modelId: string, modelTitle: string) => {
    // Switch active provider
    setActiveProvider(provider);
    // Update chosen model configuration under that provider
    setProviderConfig(provider, {
      model: modelId,
      modelTitle: modelTitle,
    });
    setSettings(getProviderSettings());
  }, []);

  const openrouterConfig = settings.providers.openrouter;
  const generalcomputeConfig = settings.providers.generalcompute;

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Top Model Dropdown Selector */}
      <div className="bg-white/5 border border-white/10 backdrop-blur-md p-5 rounded-2xl shadow-md relative z-30">
        <ModelPicker
          openRouterKey={openrouterConfig.apiKey}
          generalComputeKey={generalcomputeConfig.apiKey}
          activeProvider={settings.activeProvider}
          activeModel={settings.providers[settings.activeProvider].model}
          onSelect={handleModelSelect}
        />
      </div>

      {/* Concurrent Collapsible AI Provider Cards */}
      <div className="flex flex-col gap-5">
        
        {/* OpenRouter Layout Accordion */}
        <motion.div
          whileHover={{ y: -1 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'p-5 rounded-2xl border backdrop-blur-md transition-all shadow-sm flex flex-col gap-1',
            'bg-white/5 border-white/10',
            settings.activeProvider === 'openrouter' && openrouterConfig.apiKey
              ? 'ring-1 ring-[#FFD400]/40 border-[#FFD400]/30'
              : 'hover:border-white/20'
          )}
        >
          {/* Header click trigger */}
          <button
            type="button"
            onClick={() => setIsOROpen((prev) => !prev)}
            className={cn(
              'w-full flex items-center justify-between text-left cursor-pointer focus:outline-none transition-all duration-200',
              isOROpen ? 'border-b border-white/5 pb-2' : ''
            )}
            aria-expanded={isOROpen}
            aria-label="Toggle OpenRouter Credentials panel"
          >
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-[#FFD400]" />
              <h3 className="text-sm font-bold tracking-wide text-[#FFD400]">
                OpenRouter Credentials
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {settings.activeProvider === 'openrouter' && openrouterConfig.modelTitle && (
                <span className="text-[10px] bg-[#FFD400]/15 text-[#FFD400] px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider">
                  Active: {openrouterConfig.modelTitle}
                </span>
              )}
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ml-1',
                  isOROpen && 'rotate-180'
                )}
              />
            </div>
          </button>

          {/* Sliding Content Drawer */}
          <AnimatePresence initial={false}>
            {isOROpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="pt-4 flex flex-col gap-2">
                  <label htmlFor="openrouter-api-key" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    API Key
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        id="openrouter-api-key"
                        type={showORKey ? 'text' : 'password'}
                        value={openrouterConfig.apiKey}
                        onChange={(e) => handleKeyChange('openrouter', e.target.value)}
                        placeholder="sk-or-..."
                        className={cn(
                          'w-full rounded-lg px-3 py-2 pr-9 text-sm',
                          'bg-white/5 border text-foreground placeholder:text-muted-foreground',
                          'focus:outline-none focus:ring-2 focus:ring-[#FFD400]/50 transition-all',
                          orError ? 'border-red-400/50' : 'border-white/10'
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowORKey((prev) => !prev)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showORKey ? 'Hide key' : 'Show key'}
                      >
                        {showORKey ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSaveAndVerify('openrouter')}
                      disabled={isORVerifying}
                      aria-label="Save and verify API key"
                      title="Save and verify API key"
                      className={cn(
                        'px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 border flex items-center justify-center shrink-0 cursor-pointer',
                        isORVerifying && 'bg-white/5 border-white/10 text-muted-foreground cursor-wait',
                        !isORVerifying && orSuccess === true && 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30',
                        !isORVerifying && orSuccess === false && 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30 focus:ring-red-400/50',
                        !isORVerifying && orSuccess === null && 'bg-[#FFD400] text-black border-[#FFD400] hover:bg-[#FFD400]/90 focus:ring-yellow-400/50',
                        'focus:outline-none focus:ring-2'
                      )}
                    >
                      {isORVerifying ? (
                        <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Check className="h-4 w-4 stroke-[3]" />
                      )}
                    </button>

                    {openrouterConfig.apiKey.trim() && (
                      <button
                        type="button"
                        onClick={() => handleClearKey('openrouter')}
                        className={cn(
                          'px-3.5 py-2 rounded-lg text-sm transition-colors cursor-pointer shrink-0',
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

                  {orError && (
                    <p className="text-xs text-red-400 flex items-center gap-1.5 mt-1 font-medium">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {orError}
                    </p>
                  )}

                  {!isORVerifying && orSuccess === true && (
                    <p className="text-xs text-emerald-400 flex items-center gap-1.5 mt-1 font-medium">
                      <CheckCheck className="h-3.5 w-3.5" />
                      API key saved & verified! Connected successfully.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* General Compute Layout Accordion */}
        <motion.div
          whileHover={{ y: -1 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'p-5 rounded-2xl border backdrop-blur-md transition-all shadow-sm flex flex-col gap-1',
            'bg-white/5 border-white/10',
            settings.activeProvider === 'generalcompute' && generalcomputeConfig.apiKey
              ? 'ring-1 ring-[#FFD400]/40 border-[#FFD400]/30'
              : 'hover:border-white/20'
          )}
        >
          {/* Header click trigger */}
          <button
            type="button"
            onClick={() => setIsGCOpen((prev) => !prev)}
            className={cn(
              'w-full flex items-center justify-between text-left cursor-pointer focus:outline-none transition-all duration-200',
              isGCOpen ? 'border-b border-white/5 pb-2' : ''
            )}
            aria-expanded={isGCOpen}
            aria-label="Toggle General Compute Credentials panel"
          >
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-[#FFD400]" />
              <h3 className="text-sm font-bold tracking-wide text-[#FFD400]">
                General Compute Credentials
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {settings.activeProvider === 'generalcompute' && generalcomputeConfig.modelTitle && (
                <span className="text-[10px] bg-[#FFD400]/15 text-[#FFD400] px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider">
                  Active: {generalcomputeConfig.modelTitle}
                </span>
              )}
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ml-1',
                  isGCOpen && 'rotate-180'
                )}
              />
            </div>
          </button>

          {/* Sliding Content Drawer */}
          <AnimatePresence initial={false}>
            {isGCOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="pt-4 flex flex-col gap-2">
                  <label htmlFor="generalcompute-api-key" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    API Key
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        id="generalcompute-api-key"
                        type={showGCKey ? 'text' : 'password'}
                        value={generalcomputeConfig.apiKey}
                        onChange={(e) => handleKeyChange('generalcompute', e.target.value)}
                        placeholder="Enter General Compute API key"
                        className={cn(
                          'w-full rounded-lg px-3 py-2 pr-9 text-sm',
                          'bg-white/5 border text-foreground placeholder:text-muted-foreground',
                          'focus:outline-none focus:ring-2 focus:ring-[#FFD400]/50 transition-all',
                          gcError ? 'border-red-400/50' : 'border-white/10'
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowGCKey((prev) => !prev)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showGCKey ? 'Hide key' : 'Show key'}
                      >
                        {showGCKey ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSaveAndVerify('generalcompute')}
                      disabled={isGCVerifying}
                      aria-label="Save and verify API key"
                      title="Save and verify API key"
                      className={cn(
                        'px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 border flex items-center justify-center shrink-0 cursor-pointer',
                        isGCVerifying && 'bg-white/5 border-white/10 text-muted-foreground cursor-wait',
                        !isGCVerifying && gcSuccess === true && 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30',
                        !isGCVerifying && gcSuccess === false && 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30 focus:ring-red-400/50',
                        !isGCVerifying && gcSuccess === null && 'bg-[#FFD400] text-black border-[#FFD400] hover:bg-[#FFD400]/90 focus:ring-yellow-400/50',
                        'focus:outline-none focus:ring-2'
                      )}
                    >
                      {isGCVerifying ? (
                        <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Check className="h-4 w-4 stroke-[3]" />
                      )}
                    </button>

                    {generalcomputeConfig.apiKey.trim() && (
                      <button
                        type="button"
                        onClick={() => handleClearKey('generalcompute')}
                        className={cn(
                          'px-3.5 py-2 rounded-lg text-sm transition-colors cursor-pointer shrink-0',
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

                  {gcError && (
                    <p className="text-xs text-red-400 flex items-center gap-1.5 mt-1 font-medium">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {gcError}
                    </p>
                  )}

                  {!isGCVerifying && gcSuccess === true && (
                    <p className="text-xs text-emerald-400 flex items-center gap-1.5 mt-1 font-medium">
                      <CheckCheck className="h-3.5 w-3.5" />
                      API key saved & verified! Connected successfully.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

      </div>
    </div>
  );
}
