/**
 * ============================================================================
 * FILE: ModelPicker.test.tsx
 * LOCATION: client/src/features/settings/ModelPicker.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for the redesigned unified ModelPicker component.
 *
 * ROLE IN PROJECT:
 *    Ensures robust unified model list fetching, provider filtering, searchable
 *    filtering, loading states, and multi-provider compatibility.
 *
 * KEY COMPONENTS:
 *    - Search input filtering tests
 *    - Combined provider selection propagation tests
 *    - Loading & error boundary tests
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react, @tanstack/react-query
 *    - Internal: ./ModelPicker, @/lib/providerApi
 *
 * USAGE:
 *    npm run test -- ModelPicker.test.tsx
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ModelPicker } from './ModelPicker';
import * as providerApi from '@/lib/providerApi';
import type { ProviderModel } from '@/types/provider';

vi.mock('@/lib/providerApi', () => ({
  getProviderModels: vi.fn(() => Promise.resolve([])),
  ProviderApiError: class extends Error {
    status: number;
    constructor(msg: string, status: number) {
      super(msg);
      this.status = status;
    }
  },
}));

const MOCK_OR_MODELS: ProviderModel[] = [
  { id: 'openai/gpt-4o', name: 'GPT-4o', context_length: 128000 },
  { id: 'anthropic/claude-3', name: 'Claude 3', context_length: 200000 },
];

const MOCK_GC_MODELS: ProviderModel[] = [
  { id: 'gc-model-large', name: 'GC Model Large' },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('ModelPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Enter an API key below to select models" when no apiKey provided', () => {
    render(
      <ModelPicker
        openRouterKey=""
        generalComputeKey=""
        activeProvider="openrouter"
        activeModel=""
        onSelect={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText('Enter an API key below to select models')).toBeInTheDocument();
  });

  it('shows "Loading models..." while fetching', () => {
    vi.mocked(providerApi.getProviderModels).mockReturnValue(
      new Promise(() => {}) // never resolves
    );

    render(
      <ModelPicker
        openRouterKey="sk-or-test"
        generalComputeKey=""
        activeProvider="openrouter"
        activeModel=""
        onSelect={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Loading models...')).toBeInTheDocument();
  });

  it('renders model list when dropdown is open', async () => {
    vi.mocked(providerApi.getProviderModels).mockImplementation((provider) => {
      if (provider === 'openrouter') return Promise.resolve(MOCK_OR_MODELS);
      if (provider === 'generalcompute') return Promise.resolve(MOCK_GC_MODELS);
      return Promise.resolve([]);
    });

    render(
      <ModelPicker
        openRouterKey="sk-or-test"
        generalComputeKey="gc-test-key"
        activeProvider="openrouter"
        activeModel=""
        onSelect={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    // Click trigger button
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('GPT-4o')).toBeInTheDocument();
      expect(screen.getByText('Claude 3')).toBeInTheDocument();
      expect(screen.getByText('GC Model Large')).toBeInTheDocument();
    });
  });

  it('filters models by search query', async () => {
    vi.mocked(providerApi.getProviderModels).mockImplementation((provider) => {
      if (provider === 'openrouter') return Promise.resolve(MOCK_OR_MODELS);
      return Promise.resolve([]);
    });

    render(
      <ModelPicker
        openRouterKey="sk-or-test"
        generalComputeKey=""
        activeProvider="openrouter"
        activeModel=""
        onSelect={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('GPT-4o')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search models/i);
    fireEvent.change(searchInput, { target: { value: 'claude' } });

    expect(screen.getByText('Claude 3')).toBeInTheDocument();
    expect(screen.queryByText('GPT-4o')).not.toBeInTheDocument();
  });

  it('calls onSelect with provider and model info when clicked', async () => {
    const onSelect = vi.fn();
    vi.mocked(providerApi.getProviderModels).mockImplementation((provider) => {
      if (provider === 'openrouter') return Promise.resolve(MOCK_OR_MODELS);
      if (provider === 'generalcompute') return Promise.resolve(MOCK_GC_MODELS);
      return Promise.resolve([]);
    });

    render(
      <ModelPicker
        openRouterKey="sk-or-test"
        generalComputeKey="gc-test-key"
        activeProvider="openrouter"
        activeModel=""
        onSelect={onSelect}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('GC Model Large')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('GC Model Large'));

    expect(onSelect).toHaveBeenCalledWith('generalcompute', 'gc-model-large', 'GC Model Large', undefined);
  });
});
