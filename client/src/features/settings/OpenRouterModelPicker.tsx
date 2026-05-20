/**
 * ============================================================================
 * FILE: OpenRouterModelPicker.tsx
 * LOCATION: client/src/features/settings/OpenRouterModelPicker.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Searchable model picker that fetches the OpenRouter model catalog
 *    via React Query and lets users select a single model for all agents.
 *    Supports inline search filtering and displays model context length.
 *
 * ROLE IN PROJECT:
 *    Embedded inside OpenRouterSettingsPanel. Provides the model selection
 *    UI that populates the model/modelTitle fields in localStorage settings.
 *
 * KEY COMPONENTS:
 *    - OpenRouterModelPicker: Search + select component for models
 *
 * DEPENDENCIES:
 *    - External: react, @tanstack/react-query, lucide-react, framer-motion
 *    - Internal: @/lib/openrouterApi, @/lib/openrouterSettings, @/types/openrouter
 *
 * USAGE:
 *    ```tsx
 *    <OpenRouterModelPicker apiKey="sk-or-..." value="openai/gpt-4o" onSelect={(id, title) => {}} />
 *    ```
 * ============================================================================
 */

// OpenRouterModelPicker.tsx
// Searchable model picker for OpenRouter catalog

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ChevronDown, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { getOpenRouterModels, OpenRouterApiError } from '@/lib/openrouterApi';
import { cn } from '@/lib/utils';
import type { OpenRouterModel } from '@/types/openrouter';

interface OpenRouterModelPickerProps {
  apiKey: string;
  value: string;
  onSelect: (modelId: string, modelTitle: string) => void;
  disabled?: boolean;
}

/**
 * Fetches model list with 24h stale time, keyed by apiKey.
 * Enabled only when apiKey is non-empty.
 */
function useModelList(apiKey: string) {
  return useQuery<OpenRouterModel[], OpenRouterApiError>({
    queryKey: ['openrouter-models', apiKey],
    queryFn: () => getOpenRouterModels(apiKey),
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    retry: false,
    enabled: apiKey.length > 0,
  });
}

export function OpenRouterModelPicker({
  apiKey,
  value,
  onSelect,
  disabled = false,
}: OpenRouterModelPickerProps) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const { data: models, isLoading, error } = useModelList(apiKey);

  const filteredModels = useMemo(() => {
    if (!models) return [];
    if (!search.trim()) return models;
    const query = search.toLowerCase();
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(query) ||
        (m.name?.toLowerCase().includes(query) ?? false)
    );
  }, [models, search]);

  const selectedModel = useMemo(
    () => models?.find((m) => m.id === value),
    [models, value]
  );

  const handleSelect = useCallback(
    (model: OpenRouterModel) => {
      onSelect(model.id, model.name ?? model.id);
      setIsOpen(false);
      setSearch('');
    },
    [onSelect]
  );

  const is401 = error?.status === 401;

  return (
    <div className="relative">
      {/* Label */}
      <label className="block text-sm font-medium mb-1.5">Model</label>

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled || !apiKey}
        className={cn(
          'w-full flex items-center justify-between rounded-lg px-3 py-2',
          'bg-white/5 border border-white/10 backdrop-blur-sm',
          'text-sm text-left transition-colors',
          'hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-yellow-400/50',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="truncate">
          {!apiKey
            ? 'Enter API key first'
            : isLoading
              ? 'Loading models...'
              : selectedModel
                ? selectedModel.name ?? selectedModel.id
                : value || 'Select a model'}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform shrink-0 ml-2',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && !disabled && apiKey && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute z-50 mt-1 w-full rounded-lg overflow-hidden',
              'bg-gray-900/95 border border-white/10 backdrop-blur-md shadow-xl'
            )}
            role="listbox"
          >
            {/* Search input */}
            <div className="p-2 border-b border-white/10">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search models..."
                  className={cn(
                    'w-full pl-8 pr-3 py-1.5 rounded-md text-sm',
                    'bg-white/5 border border-white/10 text-foreground',
                    'placeholder:text-muted-foreground',
                    'focus:outline-none focus:ring-1 focus:ring-yellow-400/50'
                  )}
                  autoFocus
                />
              </div>
            </div>

            {/* Model list */}
            <div className="max-h-60 overflow-y-auto p-1">
              {isLoading ? (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  Loading models...
                </div>
              ) : is401 ? (
                <div className="px-3 py-4 text-sm text-red-400 text-center flex flex-col items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  Invalid API key
                </div>
              ) : filteredModels.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  No models found
                </div>
              ) : (
                filteredModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => handleSelect(model)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                      'hover:bg-white/10 focus:outline-none focus:bg-white/10',
                      model.id === value && 'bg-yellow-400/10 text-yellow-400'
                    )}
                    role="option"
                    aria-selected={model.id === value}
                  >
                    <div className="font-medium truncate">
                      {model.name ?? model.id}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="truncate">{model.id}</span>
                      {model.context_length && (
                        <span className="shrink-0">
                          {(model.context_length / 1000).toFixed(0)}k ctx
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
