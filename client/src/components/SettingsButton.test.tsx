/**
 * ============================================================================
 * FILE: SettingsButton.test.tsx
 * LOCATION: client/src/components/SettingsButton.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for the custom animated SettingsButton component.
 *
 * ROLE IN PROJECT:
 *    Ensures that the SettingsButton renders properly, handles mock click events,
 *    and coordinates the timeout for click rotation animations before navigating.
 *
 * KEY COMPONENTS:
 *    - SettingsButton tests
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react, react-router-dom
 *    - Internal: ./SettingsButton
 *
 * USAGE:
 *    npm run test -- SettingsButton.test.tsx
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

import { SettingsButton } from './SettingsButton';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function createWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <BrowserRouter>{children}</BrowserRouter>;
  };
}

describe('SettingsButton', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });

  it('renders a button with settings tooltip and sr-only label', () => {
    render(<SettingsButton />, { wrapper: createWrapper() });
    
    const btn = screen.getByRole('button', { name: 'Settings' });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('title', 'System preferences & settings');
  });

  it('rotates and navigates after timeout when clicked', () => {
    render(<SettingsButton />, { wrapper: createWrapper() });
    
    const btn = screen.getByRole('button', { name: 'Settings' });
    fireEvent.click(btn);
    
    // Should NOT navigate immediately (due to spin delay)
    expect(mockNavigate).not.toHaveBeenCalled();
    
    // Advance timers by 400ms to complete animation spin
    vi.advanceTimersByTime(400);
    
    expect(mockNavigate).toHaveBeenCalledWith('/settings');
  });
});
