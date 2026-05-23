/**
 * ============================================================================
 * FILE: ModelPicker.test.tsx
 * LOCATION: client/src/features/settings/ModelPicker.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for the generic ModelPicker component.
 *
 * ROLE IN PROJECT:
 *    Ensures robust fetching, searchable filtering, error handling (401),
 *    trigger display state, and multi-provider compatibility.
 *
 * KEY COMPONENTS:
 *    - Search input filtering tests
 *    - Provider selection propagation tests
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

const MOCK_MODELS: ProviderModel[] = [
  { id: 'openai/gpt-4o', name: 'GPT-4o', context_length: 128000 },
  { id: 'anthropic/claude-3', name: 'Claude 3', context_length: 200000 },
  { id: 'meta-llama/llama-3', name: 'Llama 3', context_length: 8000 },
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

  it('shows "Enter API key first" when no apiKey provided', () => {
    render(
      <ModelPicker provider="openrouter" apiKey="" value="" onSelect={vi.fn()} />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText('Enter API key first')).toBeInTheDocument();
  });

  it('shows "Loading models..." while fetching', () => {
    vi.mocked(providerApi.getProviderModels).mockReturnValue(
      new Promise(() => {}) // never resolves
    );

    render(
      <ModelPicker provider="openrouter" apiKey="sk-or-test" value="" onSelect={vi.fn()} />,
      { wrapper: createWrapper() }
    );
    fireEvent.click(screen.getByRole('button'));
    const loadingElements = screen.getAllByText('Loading models...');
    expect(loadingElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders model list when dropdown is open', async () => {
    vi.mocked(providerApi.getProviderModels).mockResolvedValue(MOCK_MODELS);

    render(
      <ModelPicker provider="openrouter" apiKey="sk-or-test" value="" onSelect={vi.fn()} />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('GPT-4o')).toBeInTheDocument();
      expect(screen.getByText('Claude 3')).toBeInTheDocument();
      expect(screen.getByText('Llama 3')).toBeInTheDocument();
    });
  });

  it('filters models by search query', async () => {
    vi.mocked(providerApi.getProviderModels).mockResolvedValue(MOCK_MODELS);

    render(
      <ModelPicker provider="openrouter" apiKey="sk-or-test" value="" onSelect={vi.fn()} />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('GPT-4o')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search models...');
    fireEvent.change(searchInput, { target: { value: 'claude' } });

    expect(screen.getByText('Claude 3')).toBeInTheDocument();
    expect(screen.queryByText('GPT-4o')).not.toBeInTheDocument();
  });

  it('calls onSelect when a model is clicked', async () => {
    const onSelect = vi.fn();
    vi.mocked(providerApi.getProviderModels).mockResolvedValue(MOCK_MODELS);

    render(
      <ModelPicker provider="openrouter" apiKey="sk-or-test" value="" onSelect={onSelect} />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('GPT-4o')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('GPT-4o'));

    expect(onSelect).toHaveBeenCalledWith('openai/gpt-4o', 'GPT-4o');
  });

  it('shows 401 error when key is invalid', async () => {
    const error = new providerApi.ProviderApiError(
      'Invalid key',
      401
    );
    vi.mocked(providerApi.getProviderModels).mockRejectedValue(error);

    render(
      <ModelPicker provider="openrouter" apiKey="bad-key" value="" onSelect={vi.fn()} />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Invalid API key')).toBeInTheDocument();
    });
  });

  it('works with generalcompute provider', async () => {
    const gcModels = [
      { id: 'gc-model-large', name: 'GC Model Large' },
    ];
    vi.mocked(providerApi.getProviderModels).mockResolvedValue(gcModels);

    render(
      <ModelPicker provider="generalcompute" apiKey="gc-test" value="" onSelect={vi.fn()} />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('GC Model Large')).toBeInTheDocument();
    });
  });
});
