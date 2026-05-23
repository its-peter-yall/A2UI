/**
 * ============================================================================
 * FILE: ModelPicker.tsx
 * LOCATION: client/src/features/settings/ModelPicker.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Searchable unified model picker that fetches and combines model catalogs
 *    from multiple configured AI providers.
 *
 * ROLE IN PROJECT:
 *    Acts as the primary model selection interface, allowing the user to select
 *    any model from either OpenRouter or General Compute in a single unified dropdown.
 *
 * KEY COMPONENTS:
 *    - ModelPicker: Search + selection UI for unified AI models list
 *    - useModelList(): Custom React Query hook fetching models per provider
 *
 * DEPENDENCIES:
 *    - External: react, @tanstack/react-query, lucide-react, framer-motion
 *    - Internal: @/lib/providerApi, @/types/provider, @/lib/utils
 *
 * USAGE:
 *    import { ModelPicker } from '@/features/settings/ModelPicker';
 *    <ModelPicker
 *      openRouterKey={orKey}
 *      generalComputeKey={gcKey}
 *      activeProvider={activeProv}
 *      activeModel={activeModel}
 *      onSelect={handleModelSelect}
 *    />
 * ============================================================================
 */

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ChevronDown, AlertTriangle, Cpu, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { getProviderModels, ProviderApiError } from '@/lib/providerApi';
import { cn } from '@/lib/utils';
import type { AIProvider, ProviderModel } from '@/types/provider';

export interface ModelPickerProps {
  openRouterKey: string;
  generalComputeKey: string;
  activeProvider: AIProvider;
  activeModel: string;
  onSelect: (provider: AIProvider, modelId: string, modelTitle: string) => void;
  disabled?: boolean;
}

function useModelList(provider: AIProvider, apiKey: string) {
  return useQuery<ProviderModel[], ProviderApiError>({
    queryKey: ['provider-models', provider, apiKey],
    queryFn: () => getProviderModels(provider, apiKey),
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    retry: false,
    enabled: apiKey.trim().length > 0,
  });
}

export function ModelPicker({
  openRouterKey,
  generalComputeKey,
  activeProvider,
  activeModel,
  onSelect,
  disabled = false,
}: ModelPickerProps) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Concurrently fetch models for configured providers
  const {
    data: orModels,
    isLoading: orLoading,
    error: orError,
  } = useModelList('openrouter', openRouterKey);

  const {
    data: gcModels,
    isLoading: gcLoading,
    error: gcError,
  } = useModelList('generalcompute', generalComputeKey);

  const hasAnyKey = Boolean(openRouterKey.trim() || generalComputeKey.trim());
  const isLoading = orLoading || gcLoading;

  // Combine lists with provider tag
  const combinedModels = useMemo(() => {
    const list: Array<ProviderModel & { provider: AIProvider }> = [];
    if (orModels) {
      orModels.forEach((m) => list.push({ ...m, provider: 'openrouter' }));
    }
    if (gcModels) {
      gcModels.forEach((m) => list.push({ ...m, provider: 'generalcompute' }));
    }
    return list;
  }, [orModels, gcModels]);

  const filteredModels = useMemo(() => {
    if (!search.trim()) return combinedModels;
    const query = search.toLowerCase();
    return combinedModels.filter(
      (m) =>
        m.id.toLowerCase().includes(query) ||
        (m.name?.toLowerCase().includes(query) ?? false) ||
        m.provider.toLowerCase().includes(query)
    );
  }, [combinedModels, search]);

  const selectedModel = useMemo(() => {
    return combinedModels.find(
      (m) => m.id === activeModel && m.provider === activeProvider
    );
  }, [combinedModels, activeModel, activeProvider]);

  const handleSelect = useCallback(
    (model: ProviderModel & { provider: AIProvider }) => {
      onSelect(model.provider, model.id, model.name ?? model.id);
      setIsOpen(false);
      setSearch('');
    },
    [onSelect]
  );

  const triggerText = useMemo(() => {
    if (!hasAnyKey) {
      return 'Enter an API key below to select models';
    }
    if (isLoading) {
      return 'Loading models...';
    }
    if (selectedModel) {
      const providerLabel =
        selectedModel.provider === 'openrouter' ? 'OpenRouter' : 'General Compute';
      return `${selectedModel.name ?? selectedModel.id} (${providerLabel})`;
    }
    return activeModel ? `${activeModel} (${activeProvider === 'openrouter' ? 'OpenRouter' : 'General Compute'})` : 'Select a model';
  }, [hasAnyKey, isLoading, selectedModel, activeModel, activeProvider]);

  return (
    <div className="relative w-full">
      {/* Label */}
      <label className="block text-sm font-semibold mb-2 text-[#FFD400] tracking-wide uppercase text-xs">
        Select Model
      </label>

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && hasAnyKey && setIsOpen((prev) => !prev)}
        disabled={disabled || !hasAnyKey}
        className={cn(
          'w-full flex items-center justify-between rounded-lg px-4 py-3',
          'bg-white/5 border border-white/10 backdrop-blur-sm',
          'text-sm text-left transition-all duration-200',
          'hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-[#FFD400]',
          'disabled:opacity-50 disabled:cursor-not-allowed shadow-inner'
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="truncate font-medium">
          {triggerText}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform shrink-0 ml-2',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown Container */}
      <AnimatePresence>
        {isOpen && !disabled && hasAnyKey && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute z-50 mt-1 w-full rounded-lg overflow-hidden',
              'bg-[#121214]/95 border border-white/10 backdrop-blur-md shadow-2xl'
            )}
            role="listbox"
          >
            {/* Search Box */}
            <div className="p-2 border-b border-white/10">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search models across all providers..."
                  className={cn(
                    'w-full pl-8 pr-3 py-1.5 rounded-md text-sm',
                    'bg-white/5 border border-white/10 text-foreground',
                    'placeholder:text-muted-foreground',
                    'focus:outline-none focus:ring-1 focus:ring-[#FFD400]'
                  )}
                  autoFocus
                />
              </div>
            </div>

            {/* Models Scrollable List */}
            <div className="max-h-72 overflow-y-auto p-1 scrollbar-thin">
              {isLoading ? (
                <div className="px-3 py-6 text-sm text-muted-foreground text-center">
                  <div className="h-5 w-5 border-2 border-[#FFD400] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  Loading models catalog...
                </div>
              ) : filteredModels.length === 0 ? (
                <div className="px-3 py-6 text-sm text-muted-foreground text-center flex flex-col items-center gap-2">
                  {(orError || gcError) ? (
                    <>
                      <AlertTriangle className="h-5 w-5 text-red-400" />
                      <span className="text-red-400 font-medium">Failed to fetch some models</span>
                      <span className="text-xs text-muted-foreground">Verify API keys in the cards below.</span>
                    </>
                  ) : (
                    <span>No models found.</span>
                  )}
                </div>
              ) : (
                filteredModels.map((model) => {
                  const isSelected =
                    model.id === activeModel && model.provider === activeProvider;
                  const isOR = model.provider === 'openrouter';

                  return (
                    <button
                      key={`${model.provider}-${model.id}`}
                      type="button"
                      onClick={() => handleSelect(model)}
                      className={cn(
                        'w-full text-left px-3 py-2.5 rounded-md text-sm transition-all duration-150 border border-transparent',
                        'hover:bg-white/10 hover:border-white/5 focus:outline-none focus:bg-white/10',
                        isSelected && 'bg-[#FFD400]/10 border-[#FFD400]/20 text-[#FFD400]'
                      )}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-semibold truncate">
                          {model.name ?? model.id}
                        </span>
                        {/* Provider Badge */}
                        <span
                          className={cn(
                            'text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 flex items-center gap-1',
                            isOR
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          )}
                        >
                          {isOR ? (
                            <Globe className="h-2.5 w-2.5" />
                          ) : (
                            <Cpu className="h-2.5 w-2.5" />
                          )}
                          {isOR ? 'OpenRouter' : 'GenCompute'}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1 truncate">
                        <span className="truncate max-w-[180px] font-mono opacity-80">{model.id}</span>
                        {model.context_length && (
                          <span className="shrink-0 bg-white/5 px-1.5 py-0.2 rounded text-[10px]">
                            {(model.context_length / 1000).toFixed(0)}k ctx
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
