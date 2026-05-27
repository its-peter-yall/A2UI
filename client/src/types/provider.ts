/**
 * ============================================================================
 * FILE: provider.ts
 * LOCATION: client/src/types/provider.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Type definitions for general compute and OpenRouter AI providers.
 *
 * ROLE IN PROJECT:
 *    Defines the shared models, types, and metadata configuration registry
 *    for AI providers supported by the application.
 *
 * KEY COMPONENTS:
 *    - AIProvider: 'openrouter' | 'generalcompute'
 *    - ProviderModel: Unified model structure including thinking support flag
 *    - ThinkingEffort: Union of available OpenRouter effort levels
 *    - ThinkingConfig: Interface for enabling and configuring reasoning effort
 *    - PROVIDERS: Metadata registry of available providers
 *
 * DEPENDENCIES:
 *    - External: None
 *    - Internal: None
 *
 * USAGE:
 *    import type { AIProvider } from '@/types/provider';
 * ============================================================================
 */

/** Provider identifiers */
export type AIProvider = 'openrouter' | 'generalcompute';

/** Normalized model entry usable across all providers */
export interface ProviderModel {
  id: string;
  name?: string;
  context_length?: number;
  supports_thinking?: boolean;
}

/** Thinking effort levels for OpenRouter reasoning mode */
export type ThinkingEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

/** Thinking configuration stored per-provider */
export interface ThinkingConfig {
  enabled: boolean;
  effort: ThinkingEffort;
}

/** Response shape from GET /llm/models */
export type ProviderModelList = ProviderModel[];

/** Provider display metadata */
export interface ProviderInfo {
  id: AIProvider;
  label: string;
  description: string;
  keyPlaceholder: string;
  docsUrl: string;
}

/** Registry of known providers */
export const PROVIDERS: Record<AIProvider, ProviderInfo> = {
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'Unified gateway to hundreds of AI models',
    keyPlaceholder: 'sk-or-...',
    docsUrl: 'https://openrouter.ai/docs',
  },
  generalcompute: {
    id: 'generalcompute',
    label: 'General Compute',
    description: 'Ultra-fast ASIC-native inference',
    keyPlaceholder: 'gc-...',
    docsUrl: 'https://docs.generalcompute.com',
  },
};
