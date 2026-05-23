/**
 * ============================================================================
 * FILE: providerApi.test.ts
 * LOCATION: client/src/lib/providerApi.test.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for providerApi client functions.
 *
 * ROLE IN PROJECT:
 *    Ensures dynamic header builder and Axios model fetching client are correct
 *    and handle errors identically to openrouterApi behavior.
 *
 * KEY COMPONENTS:
 *    - Header generation tests
 *    - Axios network mocks
 *    - API error transformation tests
 *
 * DEPENDENCIES:
 *    - External: vitest, axios
 *    - Internal: @/lib/providerApi
 *
 * USAGE:
 *    npm run test -- providerApi.test.ts
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  buildProviderHeaders,
  getProviderModels,
  ProviderApiError,
} from './providerApi';

vi.mock('axios');

describe('providerApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildProviderHeaders', () => {
    it('returns correct headers for openrouter', () => {
      const headers = buildProviderHeaders('openrouter', 'sk-or-test', 'gpt-4');
      expect(headers['X-AI-Provider']).toBe('openrouter');
      expect(headers['X-OpenRouter-Key']).toBe('sk-or-test');
      expect(headers['X-OpenRouter-Model']).toBe('gpt-4');
      expect(headers['X-OpenRouter-Title']).toBe('A2UI');
      expect(headers['HTTP-Referer']).toBeDefined();
    });

    it('returns correct headers for generalcompute', () => {
      const headers = buildProviderHeaders('generalcompute', 'gc-test', 'gc-large');
      expect(headers['X-AI-Provider']).toBe('generalcompute');
      expect(headers['X-GeneralCompute-Key']).toBe('gc-test');
      expect(headers['X-GeneralCompute-Model']).toBe('gc-large');
      expect(headers['X-OpenRouter-Key']).toBeUndefined();
    });
  });

  describe('getProviderModels', () => {
    it('sends correct openrouter request', async () => {
      const mockData = [{ id: 'gpt-4', name: 'GPT-4' }];
      vi.mocked(axios.get).mockResolvedValueOnce({ data: mockData });

      const result = await getProviderModels('openrouter', 'sk-or-test');
      expect(result).toEqual(mockData);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/llm/models'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-AI-Provider': 'openrouter',
            'X-OpenRouter-Key': 'sk-or-test',
          }),
        })
      );
    });

    it('sends correct generalcompute request', async () => {
      const mockData = [{ id: 'gc-large', name: 'GC Large' }];
      vi.mocked(axios.get).mockResolvedValueOnce({ data: mockData });

      const result = await getProviderModels('generalcompute', 'gc-test');
      expect(result).toEqual(mockData);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/llm/models'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-AI-Provider': 'generalcompute',
            'X-GeneralCompute-Key': 'gc-test',
          }),
        })
      );
    });

    it('throws ProviderApiError with status 401 on auth failure', async () => {
      const mockError = {
        isAxiosError: true,
        response: { status: 401 },
      };
      vi.mocked(axios.isAxiosError).mockReturnValueOnce(true);
      vi.mocked(axios.get).mockRejectedValueOnce(mockError);

      await expect(getProviderModels('generalcompute', 'gc-test')).rejects.toThrow(
        new ProviderApiError('Invalid or missing API key', 401)
      );
    });

    it('throws ProviderApiError with status 502 on server error', async () => {
      const mockError = {
        isAxiosError: true,
        response: { status: 502 },
      };
      vi.mocked(axios.isAxiosError).mockReturnValueOnce(true);
      vi.mocked(axios.get).mockRejectedValueOnce(mockError);

      await expect(getProviderModels('openrouter', 'sk-or-test')).rejects.toThrow(
        new ProviderApiError('Backend/provider unavailable', 502)
      );
    });
  });
});
