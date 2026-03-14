/**
 * ============================================================================
 * FILE: ErrorStates.test.tsx
 * LOCATION: client/src/features/learning/ErrorStates.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for learning error and empty state components. Validates
 *    ErrorState, NotFoundState, EmptyState, LoadingState, and GeneratingState
 *    rendering with appropriate actions and callbacks.
 *
 * ROLE IN PROJECT:
 *    Ensures all shared state UI components in the learning feature render
 *    correctly and fire the right callbacks, preventing regressions in error
 *    and loading UX across the feature.
 *
 * KEY COMPONENTS:
 *    - ErrorState tests: Renders with retry button and home link
 *    - NotFoundState tests: Renders type-specific not found message
 *    - EmptyState tests: Renders action button with callback
 *    - LoadingState tests: Renders default loading message
 *    - GeneratingState tests: Renders "Creating your learning path" message
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react, react-router-dom
 *    - Internal: ./ErrorStates
 *
 * USAGE:
 *    ```bash
 *    npm run test -- src/features/learning/ErrorStates.test.tsx
 *    ```
 * ============================================================================
 */

// ErrorStates.test.tsx
// Tests for learning error and empty state components

// Longer description (2-4 lines):
// - Validates error, not found, empty, loading, and generating UI states.
// - Ensures actions render and callbacks fire for retry and empty actions.
// - Confirms basic text content for state-specific messaging.

// @see: client/src/features/learning/ErrorStates.tsx
// @note: Uses MemoryRouter for Link-based states

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  ErrorState,
  NotFoundState,
  EmptyState,
  LoadingState,
  GeneratingState,
} from './ErrorStates';

describe('ErrorStates', () => {
  it('renders ErrorState with retry and home link', () => {
    const onRetry = vi.fn();
    render(
      <MemoryRouter>
        <ErrorState onRetry={onRetry} />
      </MemoryRouter>
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('link', { name: /back to learning home/i })
    ).toBeInTheDocument();
  });

  it('renders NotFoundState for node type', () => {
    render(
      <MemoryRouter>
        <NotFoundState type="node" />
      </MemoryRouter>
    );

    expect(screen.getByText(/topic not found/i)).toBeInTheDocument();
  });

  it('renders EmptyState action button', () => {
    const onAction = vi.fn();
    render(
      <MemoryRouter>
        <EmptyState action={{ label: 'Start Learning', onClick: onAction }} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /start learning/i }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders LoadingState with default message', () => {
    render(<LoadingState />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders GeneratingState with default title', () => {
    render(<GeneratingState />);
    expect(
      screen.getByText(/creating your learning path/i)
    ).toBeInTheDocument();
  });
});
