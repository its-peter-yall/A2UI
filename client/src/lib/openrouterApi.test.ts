/**
 * ============================================================================
 * FILE: openrouterApi.test.ts
 * LOCATION: client/src/lib/openrouterApi.test.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for the OpenRouter API client module.
 *
 * ROLE IN PROJECT:
 *    Verifies that model list requests include correct headers, error
 *    handling maps HTTP status codes to typed errors, and the client
 *    works end-to-end with mocked axios.
 *
 * DEPENDENCIES:
 *    - External: vitest, axios
 *    - Internal: ./openrouterApi
 *
 * USAGE:
 *    npm run test -- openrouterApi.test.ts
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { getOpenRouterModels, OpenRouterApiError } from './openrouterApi';

const MOCK_MODELS = [
  { id: 'openai/gpt-4o', name: 'GPT-4o', context_length: 128000 },
  { id: 'anthropic/claude-3', name: 'Claude 3', context_length: 200000 },
];

describe('getOpenRouterModels', () => {
  let getSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getSpy = vi.spyOn(axios, 'get');
  });

  afterEach(() => {
    getSpy.mockRestore();
  });

  it('fetches models with correct headers', async () => {
    getSpy.mockResolvedValueOnce({ data: MOCK_MODELS });

    const result = await getOpenRouterModels('sk-or-test-key');

    expect(getSpy).toHaveBeenCalledTimes(1);
    const [url, config] = getSpy.mock.calls[0];
    expect(url).toContain('/llm/models');
    expect(config?.headers?.['X-OpenRouter-Key']).toBe('sk-or-test-key');
    expect(config?.headers?.['X-OpenRouter-Title']).toBe('A2UI');
    expect(config?.headers?.['HTTP-Referer']).toBeDefined();
    expect(result).toEqual(MOCK_MODELS);
  });

  it('throws OpenRouterApiError with 401 on unauthorized', async () => {
    const axiosError = new axios.AxiosError(
      'Request failed with status code 401',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      { status: 401, data: { detail: 'Unauthorized' } } as never
    );
    getSpy.mockRejectedValueOnce(axiosError);

    const error = await getOpenRouterModels('bad-key').catch((e) => e);
    expect(error).toBeInstanceOf(OpenRouterApiError);
    expect(error.status).toBe(401);
    expect(error.message).toBe('Invalid or missing OpenRouter key');
  });

  it('throws OpenRouterApiError with 502 on server error', async () => {
    const axiosError = new axios.AxiosError(
      'Request failed with status code 502',
      'ERR_BAD_RESPONSE',
      undefined,
      undefined,
      { status: 502, data: { detail: 'Bad gateway' } } as never
    );
    getSpy.mockRejectedValueOnce(axiosError);

    await expect(getOpenRouterModels('sk-or-key')).rejects.toThrow(
      'Backend/OpenRouter unavailable'
    );
  });

  it('throws OpenRouterApiError with status 0 on network failure', async () => {
    getSpy.mockRejectedValueOnce(new Error('Network Error'));

    const error = await getOpenRouterModels('sk-or-key').catch((e) => e);
    expect(error).toBeInstanceOf(OpenRouterApiError);
    expect(error.status).toBe(0);
    expect(error.message).toBe('Failed to connect to backend');
  });
});
