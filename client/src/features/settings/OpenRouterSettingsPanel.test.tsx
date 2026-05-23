/**
 * ============================================================================
 * FILE: OpenRouterSettingsPanel.test.tsx
 * LOCATION: client/src/features/settings/OpenRouterSettingsPanel.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for the redesigned multi-provider OpenRouterSettingsPanel component.
 *
 * ROLE IN PROJECT:
 *    Verifies tab selection, provider storage coordination, toggle button displays,
 *    validation states, and model select operations.
 *
 * KEY COMPONENTS:
 *    - OpenRouterSettingsPanel tests
 *    - Mocked providerSettings state
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react, @tanstack/react-query
 *    - Internal: ./OpenRouterSettingsPanel, @/lib/providerSettings
 *
 * USAGE:
 *    npm run test -- OpenRouterSettingsPanel.test.tsx
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { OpenRouterSettingsPanel } from './OpenRouterSettingsPanel';
import * as providerSettings from '@/lib/providerSettings';

vi.mock('@/lib/providerSettings', () => ({
  getProviderSettings: vi.fn(() => ({
    activeProvider: 'openrouter',
    providers: {
      openrouter: { apiKey: '', model: '', modelTitle: '' },
      generalcompute: { apiKey: '', model: '', modelTitle: '' },
    },
  })),
  updateProviderConfig: vi.fn(),
  setActiveProvider: vi.fn(),
  clearProviderConfig: vi.fn(),
}));

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

describe('OpenRouterSettingsPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(providerSettings.getProviderSettings).mockReturnValue({
      activeProvider: 'openrouter',
      providers: {
        openrouter: { apiKey: '', model: '', modelTitle: '' },
        generalcompute: { apiKey: '', model: '', modelTitle: '' },
      },
    });
  });

  it('renders the toggle button with default text', () => {
    render(<OpenRouterSettingsPanel />, { wrapper: createWrapper() });
    expect(screen.getByText('Configure AI Provider')).toBeInTheDocument();
  });

  it('shows "Using {model} ({provider})" text when a key and model are saved', () => {
    vi.mocked(providerSettings.getProviderSettings).mockReturnValue({
      activeProvider: 'openrouter',
      providers: {
        openrouter: {
          apiKey: 'sk-or-abc123456789',
          model: 'openai/gpt-4o',
          modelTitle: 'GPT-4o',
        },
        generalcompute: { apiKey: '', model: '', modelTitle: '' },
      },
    });

    render(<OpenRouterSettingsPanel />, { wrapper: createWrapper() });
    expect(screen.getByText('Using GPT-4o (OpenRouter)')).toBeInTheDocument();
  });

  it('toggles settings panel open on button click and allows switching tabs', () => {
    render(<OpenRouterSettingsPanel />, { wrapper: createWrapper() });

    const toggle = screen.getByText('Configure AI Provider');
    fireEvent.click(toggle);

    expect(screen.getByLabelText('API Key')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('sk-or-...')).toBeInTheDocument();

    const gcTab = screen.getByRole('button', { name: 'General Compute' });
    fireEvent.click(gcTab);

    expect(providerSettings.setActiveProvider).toHaveBeenCalledWith('generalcompute');
  });

  it('shows validation error for empty key', () => {
    render(<OpenRouterSettingsPanel />, { wrapper: createWrapper() });

    // Open panel
    fireEvent.click(screen.getByText('Configure AI Provider'));

    // Click save with empty key
    const saveButton = screen.getByRole('button', { name: 'Save API key' });
    fireEvent.click(saveButton);

    expect(screen.getByText('API key is required')).toBeInTheDocument();
  });

  it('clears settings when clear button is clicked', () => {
    vi.mocked(providerSettings.getProviderSettings).mockReturnValue({
      activeProvider: 'openrouter',
      providers: {
        openrouter: {
          apiKey: 'sk-or-test123456789',
          model: 'openai/gpt-4o',
          modelTitle: 'GPT-4o',
        },
        generalcompute: { apiKey: '', model: '', modelTitle: '' },
      },
    });

    render(<OpenRouterSettingsPanel />, { wrapper: createWrapper() });

    // Open panel
    fireEvent.click(screen.getByText('Using GPT-4o (OpenRouter)'));

    // Click clear button
    const clearButton = screen.getByLabelText('Clear API key');
    fireEvent.click(clearButton);

    expect(providerSettings.clearProviderConfig).toHaveBeenCalledWith('openrouter');
  });
});
