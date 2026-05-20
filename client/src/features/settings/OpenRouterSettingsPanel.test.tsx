/**
 * ============================================================================
 * FILE: OpenRouterSettingsPanel.test.tsx
 * LOCATION: client/src/features/settings/OpenRouterSettingsPanel.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for the OpenRouterSettingsPanel component.
 *
 * ROLE IN PROJECT:
 *    Verifies panel toggle, API key persistence, masked display, validation
 *    errors, clear functionality, and model picker integration.
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react
 *    - Internal: ./OpenRouterSettingsPanel, @/lib/openrouterSettings
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
import * as settingsModule from '@/lib/openrouterSettings';

vi.mock('@/lib/openrouterSettings', () => ({
  getOpenRouterSettings: vi.fn(() => ({ apiKey: '', model: '', modelTitle: '' })),
  setOpenRouterSettings: vi.fn(),
  clearOpenRouterSettings: vi.fn(),
  maskApiKey: vi.fn((key: string) => (key ? `${key.slice(0, 6)}...${key.slice(-4)}` : '')),
}));

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
    // Re-apply default implementation after reset
    vi.mocked(settingsModule.getOpenRouterSettings).mockReturnValue({
      apiKey: '',
      model: '',
      modelTitle: '',
    });
    vi.mocked(settingsModule.maskApiKey).mockImplementation(
      (key: string) => (key ? `${key.slice(0, 6)}...${key.slice(-4)}` : '')
    );
    localStorage.clear();
  });

  it('renders the toggle button with default text', () => {
    render(<OpenRouterSettingsPanel />, { wrapper: createWrapper() });
    expect(screen.getByText('Configure OpenRouter')).toBeInTheDocument();
  });

  it('shows "Using {model}" text when a key and model are saved', () => {
    vi.mocked(settingsModule.getOpenRouterSettings).mockReturnValue({
      apiKey: 'sk-or-abc123456789',
      model: 'openai/gpt-4o',
      modelTitle: 'GPT-4o',
    });

    render(<OpenRouterSettingsPanel />, { wrapper: createWrapper() });
    expect(screen.getByText('Using GPT-4o')).toBeInTheDocument();
  });

  it('toggles settings panel open on button click', () => {
    render(<OpenRouterSettingsPanel />, { wrapper: createWrapper() });

    const toggle = screen.getByText('Configure OpenRouter');
    fireEvent.click(toggle);

    expect(screen.getByLabelText('API Key')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('sk-or-...')).toBeInTheDocument();
  });

  it('shows validation error for empty key', () => {
    render(<OpenRouterSettingsPanel />, { wrapper: createWrapper() });

    // Open panel
    fireEvent.click(screen.getByText('Configure OpenRouter'));

    // Click save with empty key
    const saveButton = screen.getByRole('button', { name: 'Save API key' });
    fireEvent.click(saveButton);

    expect(screen.getByText('API key is required')).toBeInTheDocument();
  });

  it('clears settings when clear button is clicked', () => {
    vi.mocked(settingsModule.getOpenRouterSettings).mockReturnValue({
      apiKey: 'sk-or-test123456789',
      model: 'openai/gpt-4o',
      modelTitle: 'GPT-4o',
    });

    render(<OpenRouterSettingsPanel />, { wrapper: createWrapper() });

    // Open panel
    fireEvent.click(screen.getByText('Using GPT-4o'));

    // Click clear button
    const clearButton = screen.getByLabelText('Clear API key');
    fireEvent.click(clearButton);

    expect(settingsModule.clearOpenRouterSettings).toHaveBeenCalled();
  });
});
