/**
 * ============================================================================
 * FILE: OpenRouterModelPicker.test.tsx
 * LOCATION: client/src/features/settings/OpenRouterModelPicker.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for the OpenRouterModelPicker component.
 *
 * ROLE IN PROJECT:
 *    Verifies model list rendering, search filtering, selection behavior,
 *    disabled states, and 401 error display in the dropdown.
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react
 *    - Internal: ./OpenRouterModelPicker, @/lib/openrouterApi
 *
 * USAGE:
 *    npm run test -- OpenRouterModelPicker.test.tsx
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { OpenRouterModelPicker } from './OpenRouterModelPicker';
import * as openrouterApi from '@/lib/openrouterApi';
import type { OpenRouterModel } from '@/types/openrouter';

vi.mock('@/lib/openrouterApi', () => ({
  getOpenRouterModels: vi.fn(() => Promise.resolve([])),
  OpenRouterApiError: class extends Error {
    status: number;
    constructor(msg: string, status: number) {
      super(msg);
      this.status = status;
    }
  },
}));

const MOCK_MODELS: OpenRouterModel[] = [
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

describe('OpenRouterModelPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Enter API key first" when no apiKey provided', () => {
    render(
      <OpenRouterModelPicker apiKey="" value="" onSelect={vi.fn()} />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText('Enter API key first')).toBeInTheDocument();
  });

  it('shows "Loading models..." while fetching', () => {
    vi.mocked(openrouterApi.getOpenRouterModels).mockReturnValue(
      new Promise(() => {}) // never resolves
    );

    render(
      <OpenRouterModelPicker apiKey="sk-or-test" value="" onSelect={vi.fn()} />,
      { wrapper: createWrapper() }
    );
    fireEvent.click(screen.getByRole('button'));
    // "Loading models..." appears in both trigger and dropdown
    const loadingElements = screen.getAllByText('Loading models...');
    expect(loadingElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders model list when dropdown is open', async () => {
    vi.mocked(openrouterApi.getOpenRouterModels).mockResolvedValue(MOCK_MODELS);

    render(
      <OpenRouterModelPicker apiKey="sk-or-test" value="" onSelect={vi.fn()} />,
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
    vi.mocked(openrouterApi.getOpenRouterModels).mockResolvedValue(MOCK_MODELS);

    render(
      <OpenRouterModelPicker apiKey="sk-or-test" value="" onSelect={vi.fn()} />,
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
    vi.mocked(openrouterApi.getOpenRouterModels).mockResolvedValue(MOCK_MODELS);

    render(
      <OpenRouterModelPicker apiKey="sk-or-test" value="" onSelect={onSelect} />,
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
    const error = new openrouterApi.OpenRouterApiError(
      'Invalid key',
      401
    );
    vi.mocked(openrouterApi.getOpenRouterModels).mockRejectedValue(error);

    render(
      <OpenRouterModelPicker apiKey="bad-key" value="" onSelect={vi.fn()} />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Invalid API key')).toBeInTheDocument();
    });
  });

  it('shows selected model name in trigger button', async () => {
    vi.mocked(openrouterApi.getOpenRouterModels).mockResolvedValue(MOCK_MODELS);

    render(
      <OpenRouterModelPicker
        apiKey="sk-or-test"
        value="anthropic/claude-3"
        onSelect={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('Claude 3')).toBeInTheDocument();
    });
  });
});
