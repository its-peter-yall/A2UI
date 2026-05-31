/**
 * ============================================================================
 * FILE: OpenRouterSettingsPanel.test.tsx
 * LOCATION: client/src/features/settings/OpenRouterSettingsPanel.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for the redesigned multi-provider OpenRouterSettingsPanel component
 *    featuring concurrent OpenRouter and General Compute layout boxes.
 *
 * ROLE IN PROJECT:
 *    Verifies rendering of concurrent credential cards, independent input state
 *    coordination, validation errors, saving keys, and model selection.
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
import { getProviderModels } from '@/lib/providerApi';

vi.mock('@/lib/providerSettings', () => ({
  getProviderSettings: vi.fn(() => ({
    activeProvider: 'openrouter',
    providers: {
      openrouter: { apiKey: '', model: '', modelTitle: '' },
      generalcompute: { apiKey: '', model: '', modelTitle: '' },
    },
  })),
  setProviderConfig: vi.fn(),
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

  it('renders both OpenRouter and General Compute credentials sections simultaneously', () => {
    render(<OpenRouterSettingsPanel />, { wrapper: createWrapper() });
    expect(screen.getByText('OpenRouter Credentials')).toBeInTheDocument();
    expect(screen.getByText('General Compute Credentials')).toBeInTheDocument();
  });

  it('shows active model badge when an active model is saved', () => {
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
    expect(screen.getByText('Active: GPT-4o')).toBeInTheDocument();
  });

  it('allows typing into both OpenRouter and General Compute API key fields', () => {
    render(<OpenRouterSettingsPanel />, { wrapper: createWrapper() });

    const orInput = screen.getByPlaceholderText('sk-or-...') as HTMLInputElement;
    const gcInput = screen.getByPlaceholderText('Enter General Compute API key') as HTMLInputElement;

    fireEvent.change(orInput, { target: { value: 'sk-or-changed' } });
    fireEvent.change(gcInput, { target: { value: 'gc-changed' } });

    expect(providerSettings.setProviderConfig).toHaveBeenCalledWith('openrouter', { apiKey: 'sk-or-changed' });
    expect(providerSettings.setProviderConfig).toHaveBeenCalledWith('generalcompute', { apiKey: 'gc-changed' });
  });

  it('shows validation error for empty key when verified', () => {
    render(<OpenRouterSettingsPanel />, { wrapper: createWrapper() });

    const saveButtons = screen.getAllByRole('button', { name: 'Save and verify API key' });
    
    // OpenRouter Save Button
    fireEvent.click(saveButtons[0]);

    expect(screen.getByText('API key is required')).toBeInTheDocument();
  });

  it('clears settings when clear button is clicked for a provider', () => {
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

    // OpenRouter has clear button since its key is non-empty
    const clearButton = screen.getByRole('button', { name: 'Clear API key' });
    fireEvent.click(clearButton);

    expect(providerSettings.clearProviderConfig).toHaveBeenCalledWith('openrouter');
  });

  it('calls getProviderModels and displays success state on validation success', async () => {
    vi.mocked(providerSettings.getProviderSettings).mockReturnValue({
      activeProvider: 'openrouter',
      providers: {
        openrouter: {
          apiKey: 'sk-or-test123456789',
          model: '',
          modelTitle: '',
        },
        generalcompute: { apiKey: '', model: '', modelTitle: '' },
      },
    });
    vi.mocked(getProviderModels).mockResolvedValue([]);

    render(<OpenRouterSettingsPanel />, { wrapper: createWrapper() });

    const verifyButtons = screen.getAllByRole('button', { name: 'Save and verify API key' });
    fireEvent.click(verifyButtons[0]);

    expect(getProviderModels).toHaveBeenCalledWith('openrouter', 'sk-or-test123456789');
    
    const successMsg = await screen.findByText(/API key saved & verified! Connected successfully./i);
    expect(successMsg).toBeInTheDocument();
  });
});
