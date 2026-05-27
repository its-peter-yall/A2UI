/**
 * ============================================================================
 * FILE: ThinkingModeToggle.test.tsx
 * LOCATION: client/src/features/settings/ThinkingModeToggle.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for the ThinkingModeToggle component.
 *
 * ROLE IN PROJECT:
 *    Ensures that the OpenRouter thinking mode toggle renders only when supported,
 *    correctly handles state switches, renders the effort picker, and emits
 *    change events to the parent components.
 *
 * KEY COMPONENTS:
 *    - Rendering tests (hidden vs visible)
 *    - Event propagation and state change tests
 *    - Dropdown toggle, selection, disabled, and click-outside handler tests
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react
 *    - Internal: ./ThinkingModeToggle
 * ============================================================================
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThinkingModeToggle } from './ThinkingModeToggle';

describe('ThinkingModeToggle', () => {
  it('renders nothing when model does not support thinking', () => {
    const { container } = render(
      <ThinkingModeToggle
        enabled={false}
        effort="high"
        onChange={vi.fn()}
        supportsThinking={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders toggle when model supports thinking', () => {
    render(
      <ThinkingModeToggle
        enabled={false}
        effort="high"
        onChange={vi.fn()}
        supportsThinking={true}
      />
    );
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('toggle calls onChange with inverted enabled state', () => {
    const onChange = vi.fn();
    render(
      <ThinkingModeToggle
        enabled={false}
        effort="high"
        onChange={onChange}
        supportsThinking={true}
      />
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true, 'high');
  });

  it('shows effort picker when enabled and uses testid badge', () => {
    render(
      <ThinkingModeToggle
        enabled={true}
        effort="high"
        onChange={vi.fn()}
        supportsThinking={true}
      />
    );
    // Uses precise test ID to verify the badge instead of getByText smells
    expect(screen.getByTestId('thinking-effort-badge')).toHaveTextContent('High');
  });

  it('hides effort picker when disabled', () => {
    render(
      <ThinkingModeToggle
        enabled={false}
        effort="high"
        onChange={vi.fn()}
        supportsThinking={true}
      />
    );
    expect(screen.queryByTestId('thinking-effort-badge')).not.toBeInTheDocument();
  });

  it('handles effort selection event', () => {
    const onChange = vi.fn();
    render(
      <ThinkingModeToggle
        enabled={true}
        effort="high"
        onChange={onChange}
        supportsThinking={true}
      />
    );

    // Open dropdown
    fireEvent.click(screen.getByTestId('effort-picker-trigger'));
    expect(screen.getByTestId('effort-picker-dropdown')).toBeInTheDocument();

    // Click "Minimal" option
    fireEvent.click(screen.getByText('Minimal'));
    expect(onChange).toHaveBeenCalledWith(true, 'minimal');
  });

  it('respects the disabled prop and does not toggle or trigger dropdown', () => {
    const onChange = vi.fn();
    render(
      <ThinkingModeToggle
        enabled={true}
        effort="high"
        onChange={onChange}
        disabled={true}
        supportsThinking={true}
      />
    );

    // Click switch
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();

    // Click trigger
    fireEvent.click(screen.getByTestId('effort-picker-trigger'));
    expect(screen.queryByTestId('effort-picker-dropdown')).not.toBeInTheDocument();
  });

  it('closes dropdown when clicking outside', () => {
    render(
      <ThinkingModeToggle
        enabled={true}
        effort="high"
        onChange={vi.fn()}
        supportsThinking={true}
      />
    );

    // Open dropdown
    fireEvent.click(screen.getByTestId('effort-picker-trigger'));
    expect(screen.getByTestId('effort-picker-dropdown')).toBeInTheDocument();

    // Click outside on body
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('effort-picker-dropdown')).not.toBeInTheDocument();
  });
});
