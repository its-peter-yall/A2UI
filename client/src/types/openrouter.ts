/**
 * ============================================================================
 * FILE: openrouter.ts
 * LOCATION: client/src/types/openrouter.ts
 * ============================================================================
 *
 * PURPOSE:
 *    TypeScript type definitions for OpenRouter model catalog responses
 *    received from the backend /llm/models proxy endpoint.
 *
 * ROLE IN PROJECT:
 *    Provides type safety for model data flowing from the backend into
 *    the model picker component. Maps directly to the Pydantic
 *    ModelResponse schema on the server side.
 *
 * KEY COMPONENTS:
 *    - OpenRouterModel: Model entry with id, optional name and context length
 *    - OpenRouterModelList: Array of model entries (response shape)
 *
 * DEPENDENCIES:
 *    - External: (none)
 *    - Internal: (none)
 *
 * USAGE:
 *    ```ts
 *    import type { OpenRouterModel } from '@/types/openrouter';
 *    const model: OpenRouterModel = { id: 'openai/gpt-4o', name: 'GPT-4o', context_length: 128000 };
 *    ```
 * ============================================================================
 */

// openrouter.ts
// Types for OpenRouter model catalog

/** Single model entry from the OpenRouter catalog. */
export interface OpenRouterModel {
  /** Model identifier slug (e.g., "openai/gpt-4o") */
  id: string;
  /** Human-readable model name */
  name?: string;
  /** Context window length in tokens */
  context_length?: number;
}

/** Response shape from GET /llm/models */
export type OpenRouterModelList = OpenRouterModel[];
