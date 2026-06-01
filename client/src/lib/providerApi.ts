/**
 * ============================================================================
 * FILE: providerApi.ts
 * LOCATION: client/src/lib/providerApi.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Provides API client functions for fetching provider model catalogs
 *    and building authorization headers.
 *
 * ROLE IN PROJECT:
 *    Interfaces with the backend model-proxy endpoints and supplies headers
 *    for AI-driven request execution (chat, course generation, quizzes).
 *
 * KEY COMPONENTS:
 *    - buildProviderHeaders(): Build headers dynamically for active provider
 *    - getProviderModels(): Fetch provider models with authentication
 *    - ProviderApiError: Normalized error subclass for provider requests
 *
 * DEPENDENCIES:
 *    - External: axios
 *    - Internal: @/types/provider
 *
 * USAGE:
 *    import { getProviderModels } from '@/lib/providerApi';
 * ============================================================================
 */

import axios from 'axios';
import type { AIProvider, ProviderModelList } from '@/types/provider';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export class ProviderApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ProviderApiError';
    this.status = status;
  }
}

/**
 * Builds provider-specific headers for backend requests.
 */
export function buildProviderHeaders(
  provider: AIProvider,
  apiKey: string,
  model?: string,
  thinking?: { enabled: boolean; effort?: string },
  maxCompletionTokens?: number
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-AI-Provider': provider,
  };

  if (provider === 'openrouter') {
    headers['X-OpenRouter-Key'] = apiKey;
    if (model) headers['X-OpenRouter-Model'] = model;
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-OpenRouter-Title'] = 'A2UI';
    
    // Add thinking headers for OpenRouter only
    if (thinking?.enabled) {
      headers['X-Thinking-Enabled'] = 'true';
      headers['X-Thinking-Effort'] = thinking.effort || 'high';
    }
  } else if (provider === 'generalcompute') {
    headers['X-GeneralCompute-Key'] = apiKey;
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  // Send model-specific max output token limit
  if (maxCompletionTokens && maxCompletionTokens > 0) {
    headers['X-Max-Completion-Tokens'] = String(maxCompletionTokens);
  }

  return headers;
}

/**
 * Fetches the model catalog for the active provider.
 */
export async function getProviderModels(
  provider: AIProvider,
  apiKey: string
): Promise<ProviderModelList> {
  try {
    const response = await axios.get<ProviderModelList>(
      `${baseURL}/llm/models`,
      {
        headers: buildProviderHeaders(provider, apiKey),
        timeout: 15000,
      }
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const { status } = error.response;
      if (status === 401) {
        throw new ProviderApiError('Invalid or missing API key', 401);
      }
      throw new ProviderApiError('Backend/provider unavailable', status);
    }
    throw new ProviderApiError('Failed to connect to backend', 0);
  }
}
