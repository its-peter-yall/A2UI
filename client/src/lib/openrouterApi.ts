/**
 * ============================================================================
 * FILE: openrouterApi.ts
 * LOCATION: client/src/lib/openrouterApi.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Provides typed API client for fetching the OpenRouter model catalog
 *    via the backend /llm/models proxy endpoint. Attaches required
 *    OpenRouter authentication and attribution headers.
 *
 * ROLE IN PROJECT:
 *    Used by the model picker component (React Query) to fetch and cache
 *    the full list of available models. Handles 401 errors for invalid
 *    keys and 5xx errors for backend unavailability.
 *
 * KEY COMPONENTS:
 *    - getOpenRouterModels(): Fetches model list with auth headers
 *    - OpenRouterApiError: Typed error for API failures
 *
 * DEPENDENCIES:
 *    - External: axios
 *    - Internal: @/lib/openrouterSettings, @/types/openrouter
 *
 * USAGE:
 *    ```ts
 *    import { getOpenRouterModels } from '@/lib/openrouterApi';
 *    const models = await getOpenRouterModels('sk-or-...');
 *    ```
 * ============================================================================
 */

// openrouterApi.ts
// API client for OpenRouter model catalog

import axios from 'axios';
import type { OpenRouterModelList } from '../types/openrouter';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export class OpenRouterApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'OpenRouterApiError';
    this.status = status;
  }
}

/**
 * Fetches the OpenRouter model catalog from the backend.
 *
 * @param apiKey - OpenRouter API key for authentication
 * @returns List of available models
 * @throws OpenRouterApiError with status 401 for invalid key,
 *         502 for backend/OpenRouter unavailability
 */
export async function getOpenRouterModels(
  apiKey: string
): Promise<OpenRouterModelList> {
  try {
    const response = await axios.get<OpenRouterModelList>(
      `${baseURL}/llm/models`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-OpenRouter-Key': apiKey,
          'HTTP-Referer': window.location.origin,
          'X-OpenRouter-Title': 'A2UI',
        },
        timeout: 15000,
      }
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const { status } = error.response;
      if (status === 401) {
        throw new OpenRouterApiError(
          'Invalid or missing OpenRouter key',
          401
        );
      }
      throw new OpenRouterApiError(
        'Backend/OpenRouter unavailable',
        status
      );
    }
    throw new OpenRouterApiError(
      'Failed to connect to backend',
      0
    );
  }
}
